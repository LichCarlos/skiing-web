"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useState } from "react";
import { Button, Form, Select } from "antd";
import { FormHint } from "@/components/form-hint";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { readAllDictionaries } from "@/features/dictionaries/dictionary-queries";
import type { Dictionary } from "@/features/dictionaries/dictionary-model";
import type { User } from "@/features/custom-fields/field-model";

export function FieldDictionarySelect({
  user,
  current,
}: {
  user: User;
  current?: string | null;
}) {
  const [lane] = useState(() => new RequestLane());
  const [items, setItems] = useState<Dictionary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const canRead = user.permissionKeys.includes("system:dict:list");
  useEffect(() => {
    if (!canRead || document.visibilityState !== "visible") return;
    void lane.run(
      (signal) => readAllDictionaries(apiRequest, user, signal, "active"),
      setItems,
      () => setError("选项字典读取失败，请重试"),
      () => setLoading(false),
    );
    return () => lane.cancel();
  }, [lane, user, canRead, attempt]);
  const unavailable =
    current && !items.some((item) => item.dictType === current);
  return (
    <>
      <Form.Item
        name="optionsDictType"
        label="选项字典"
        required
        extra={
          <FormHint>
            {!canRead
              ? "当前账号没有字典读取权限，可保留原绑定；需要选择字典时请联系管理员授权。"
              : "从已启用的字典中选择，显示名称与系统标识便于核对。没有合适的选项时，先在数据字典中新建选项字典。"}
          </FormHint>
        }
        rules={[
          { required: true, message: "请选择选项字典" },
          {
            validator: async (_, value: string) => {
              if (!canRead && value === current) return;
              if (
                !canRead ||
                loading ||
                error ||
                !items.some((item) => item.dictType === value)
              )
                throw new Error("请选择已启用且读取成功的字典");
            },
          },
        ]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={!canRead ? "需要字典读取权限" : "选择已启用的选项字典"}
          loading={canRead && loading}
          disabled={!canRead || loading || !!error}
          options={[
            ...items.map((item) => ({
              value: item.dictType,
              label: `${item.dictName}（${item.dictType}）`,
            })),
            ...(unavailable
              ? [
                  {
                    value: current,
                    label: `${current}（${!canRead ? "原绑定" : loading ? "读取中" : "当前不可用"}）`,
                    disabled: true,
                  },
                ]
              : []),
          ]}
        />
      </Form.Item>
      {error ? (
        <div role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button
            onClick={() => {
              setItems([]);
              setError(undefined);
              setLoading(true);
              setAttempt((v) => v + 1);
            }}
          >
            重新读取字典
          </Button>
        </div>
      ) : null}
    </>
  );
}
