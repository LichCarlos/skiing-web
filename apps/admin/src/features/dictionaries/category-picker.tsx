"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useState } from "react";
import { Button, Form, Modal, Select } from "antd";
import { FormHint } from "@/components/form-hint";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import type {
  Dictionary,
  DictionaryUser,
} from "@/features/dictionaries/dictionary-model";
import { readDictionaryDetail } from "@/features/dictionaries/dictionary-queries";
import {
  readCategoryOptions,
  verifyCategoryField,
  type CategoryOption,
} from "@/features/dictionaries/category-options";

export function CategoryPicker({
  user,
  onCancel,
  onChoose,
  onMissing,
}: {
  user: DictionaryUser;
  onCancel(): void;
  onChoose(dictionary: Dictionary): void;
  onMissing(option: CategoryOption): void;
}) {
  const [lane] = useState(() => new RequestLane());
  const [options, setOptions] = useState<CategoryOption[]>([]);
  const [value, setValue] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const selected = options.find((item) => item.value === value);
  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    void lane.run(
      (signal) => readCategoryOptions(apiRequest, user, signal),
      setOptions,
      () => setError("分类字段暂时不可用，请重试读取"),
      () => setLoading(false),
    );
    return () => lane.cancel();
  }, [lane, user, attempt]);
  async function confirm() {
    if (
      !selected ||
      selected.disabled ||
      loading ||
      document.visibilityState !== "visible"
    )
      return;
    setLoading(true);
    setError(undefined);
    await lane.run(
      async (signal) => {
        await verifyCategoryField(apiRequest, user, selected, signal);
        if (!selected.dictionary) return null;
        const dictionary = await readDictionaryDetail(
          apiRequest,
          user,
          selected.dictType,
          signal,
        );
        if (dictionary.status !== "active") throw new Error("字典已停用");
        return dictionary;
      },
      (dictionary) => (dictionary ? onChoose(dictionary) : onMissing(selected)),
      () => {
        setError("字段或字典已变化，请重新读取后选择");
        setOptions([]);
        setValue(undefined);
      },
      () => setLoading(false),
    );
  }
  return (
    <Modal
      title="新增分类"
      open
      onCancel={onCancel}
      onOk={() => void confirm()}
      okText={selected && !selected.dictionary ? "配置分类字典" : "下一步"}
      okButtonProps={{ disabled: !selected || selected.disabled || !!error }}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item
          label="所属字段"
          required
          extra={
            <FormHint>
              选择需要添加分类的字段。仅展示固定分类字段和已启用的单选、多选扩展字段；字典键与分组自动匹配。
            </FormHint>
          }
        >
          <Select
            aria-label="所属字段"
            placeholder="选择需要新增分类的字段"
            showSearch
            optionFilterProp="label"
            value={value}
            onChange={setValue}
            loading={loading}
            disabled={loading || !!error}
            options={options.map((item) => ({
              value: item.value,
              label:
                item.label +
                (item.disabled
                  ? "（字典已停用）"
                  : !item.dictionary
                    ? "（待配置）"
                    : ""),
              disabled: item.disabled,
            }))}
          />
        </Form.Item>
        {selected ? (
          <FormHint>
            字典：{selected.dictName}（{selected.dictType}）<br />
            分组：{selected.groupKey}
            {!selected.dictionary ? (
              <>
                <br />
                此字段尚未配置字典，下一步先创建对应字典。
              </>
            ) : null}
          </FormHint>
        ) : null}
        {!user.permissionKeys.includes("system:field:list") ? (
          <FormHint>当前账号没有字段读取权限，仅显示固定分类字段。</FormHint>
        ) : null}
        {error ? (
          <div role="alert">
            <AdminParagraph>{error}</AdminParagraph>
            <Button
              onClick={() => {
                setOptions([]);
                setValue(undefined);
                setError(undefined);
                setLoading(true);
                setAttempt((v) => v + 1);
              }}
            >
              重新读取
            </Button>
          </div>
        ) : null}
      </Form>
    </Modal>
  );
}
