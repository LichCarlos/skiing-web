"use client";
import { AdminParagraph } from "@/components/admin-paragraph";
import { FormHint } from "@/components/form-hint";

import { useCallback, useEffect, useRef, useState } from "react";
import { App, Alert, Button, Input, Modal } from "antd";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import {
  configError,
  type ConfigItem,
} from "@/features/system-config/config-api";
import {
  canManageConfig,
  type ConfigOperator,
} from "@/features/system-config/config-model";
import {
  readConfigItem,
  prepareConfigSave,
  writeConfig,
} from "@/features/system-config/config-queries";
import type { ConfigWrites } from "@/features/system-config/config-session";
export function ConfigEditor({
  operator,
  configKey,
  writes,
  close,
  saved,
}: {
  operator: ConfigOperator;
  configKey: string;
  writes: ConfigWrites;
  close: () => void;
  saved: () => void;
}) {
  const { message } = App.useApp();
  const [item, setItem] = useState<ConfigItem>(),
    [value, setValue] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [conflict, setConflict] = useState(false);
  const [lane] = useState(() => new RequestLane());
  const generation = useRef(0);
  const active = useRef(true);
  const reload = useCallback(async () => {
    if (document.visibilityState !== "visible" || !active.current) return false;
    writes.gate.activate();
    setLoading(true);
    setItem(undefined);
    setValue("");
    setError(undefined);
    setConflict(false);
    return lane.run(
      (signal) => readConfigItem(apiRequest, operator, configKey, signal),
      (current) => {
        setItem(current);
        setValue(current.value ?? "");
      },
      (cause) => setError(configError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, configKey, writes.gate]);
  useEffect(() => {
    active.current = true;
    const clear = () => {
      generation.current++;
      lane.cancel();
      setItem(undefined);
      setValue("");
      setLoading(false);
      setConflict(false);
      setError("页面读取已暂停，请刷新后继续");
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    hide();
    return () => {
      active.current = false;
      generation.current++;
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [lane]);
  useEffect(() => {
    void reload();
    return () => lane.cancel();
  }, [reload, lane]);
  async function save() {
    if (
      !item ||
      loading ||
      conflict ||
      !active.current ||
      !writes.gate.isActive() ||
      document.visibilityState !== "visible"
    )
      return;
    const currentGeneration = generation.current;
    const current = () =>
      active.current &&
      generation.current === currentGeneration &&
      document.visibilityState === "visible" &&
      writes.gate.isActive();
    const result = await writes.run(
      { configKey: item.configKey },
      (signal) => prepareConfigSave(apiRequest, operator, item, value, signal),
      (body, signal) => writeConfig(apiRequest, item, body, signal),
      () => {
        if (!current()) return;
        message.success("系统配置已保存");
        close();
        saved();
      },
    );
    if (current() && result.status === "error") {
      if (result.uncertain) close();
      else {
        setError(result.message);
        if (result.conflict) setConflict(true);
      }
    }
  }
  const canWrite = canManageConfig(operator, true);
  return (
    <Modal
      open
      title={item?.label ?? "读取配置"}
      confirmLoading={writes.saving}
      onOk={() => void save()}
      onCancel={() => {
        if (!writes.gate.isBusy()) close();
      }}
      okButtonProps={{
        disabled: !canWrite || loading || !item || conflict || writes.pending,
      }}
      cancelButtonProps={{ disabled: writes.saving }}
      maskClosable={!writes.saving}
    >
      {loading ? (
        <AdminParagraph role="status">正在读取最新配置</AdminParagraph>
      ) : null}
      {error ? <Alert type="error" title={error} /> : null}
      {item ? (
        <>
          <AdminParagraph>
            {item.configKey} · 原版本 {item.version}
          </AdminParagraph>
          <label htmlFor="config-value">配置内容</label>
          <Input.TextArea
            id="config-value"
            aria-describedby="config-value-hint"
            value={value}
            readOnly={!canWrite || writes.pending || conflict}
            disabled={writes.saving}
            rows={item.maxLength > 1000 ? 12 : 3}
            onChange={(event) => setValue(event.target.value)}
          />
          <FormHint id="config-value-hint">
            填写“{item.label}”，最多{item.maxLength}
            字；保存时核对当前版本，冲突后需重新读取。
            {item.configKey === "site.contactEmail"
              ? "请填写有效的邮箱地址。"
              : ""}
          </FormHint>
          <AdminParagraph>
            {[...value.trim()].length} / {item.maxLength} 字
          </AdminParagraph>
        </>
      ) : null}
      {!loading ? (
        <Button
          disabled={writes.saving}
          onClick={() => {
            if (!writes.gate.isBusy()) void reload();
          }}
        >
          刷新配置并重新编辑（丢弃当前修改）
        </Button>
      ) : null}
    </Modal>
  );
}
