"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Input, Space } from "antd";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import { verifyAccountIdentity } from "@/features/users/user-queries";
import {
  accountError,
  isAccountAdministrator,
  type Operator,
  type ManagedAccount,
} from "@/features/users/user-model";
import { ArticleCustomFields } from "@/features/articles/article-custom-fields";
import { parseArticleFieldSchema } from "@/features/articles/article-responses";
import {
  articleOptionDictionaries,
  initialArticleFields,
  writableArticleChanges,
  type ArticleFieldSchema,
  type ArticleFieldOptions,
} from "@/features/articles/article-field-model";
import { parseDictionary } from "@/features/dictionaries/dictionary-queries";
import styles from "@/features/users/managed-user-detail.module.css";

import {
  parseMerchantProfile as profile,
  type Profile,
} from "@/features/users/merchant-profile-model";
// Metadata only: uncertain writes survive leaving/re-entering this page in this tab.
const pending = new Map<string, "in-flight" | "unknown">();
export function MerchantProfilePanel({
  operator,
  target,
  onSaved,
}: {
  operator: Operator;
  target: ManagedAccount;
  onSaved: () => void;
}) {
  const allowed =
    isAccountAdministrator(operator) &&
    operator.permissionKeys.includes("system:merchant-profile:read");
  return allowed ? (
    <ProfileWorkspace
      key={`${operator.userId}:${target.userId}`}
      operator={operator}
      target={target}
      onSaved={onSaved}
    />
  ) : null;
}
function ProfileWorkspace({
  operator,
  target,
  onSaved,
}: {
  operator: Operator;
  target: ManagedAccount;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const [data, setData] = useState<{
    profile: Profile | null;
    schema: ArticleFieldSchema;
    options: ArticleFieldOptions;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [, render] = useState(0);
  const active = useRef<AbortController | null>(null),
    lock = useRef(false);
  const key = `${operator.userId}:${target.userId}`;
  const path = `/admin/users/${target.userId}/merchant-profile`;
  const reload = useCallback(async () => {
    if (lock.current || document.visibilityState !== "visible") return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setData(null);
    form.resetFields();
    setMessage("");
    try {
      await verifyAccountIdentity(operator, controller.signal);
      const [raw, schemaRaw] = await Promise.all([
        apiRequest<unknown>(path, {
          signal: controller.signal,
          cache: "no-store",
        }),
        apiRequest<unknown>("/admin/merchant-profiles/custom-fields", {
          signal: controller.signal,
          cache: "no-store",
        }),
      ]);
      const current = profile(raw, target.userId),
        schema = parseArticleFieldSchema(schemaRaw, "merchant_profile");
      const entries = await Promise.all(
        articleOptionDictionaries(schema).map(async (type) => {
          const dictionary = parseDictionary(
            await apiRequest<unknown>(
              `/admin/dictionaries/${encodeURIComponent(type)}`,
              { signal: controller.signal, cache: "no-store" },
            ),
          );
          if (dictionary.dictType !== type || dictionary.status !== "active")
            throw Error("字段选项不可用");
          const options: Array<{ value: string; label: string }> = [];
          const visit = (items: typeof dictionary.items) => {
            for (const item of items)
              if (item.status === "active") {
                options.push({ value: item.value, label: item.label });
                visit(item.children);
              }
          };
          visit(dictionary.items);
          return [type, options] as const;
        }),
      );
      await verifyAccountIdentity(operator, controller.signal);
      controller.signal.throwIfAborted();
      setData({
        profile: current,
        schema,
        options: Object.fromEntries(entries),
      });
      form.setFieldsValue({
        businessName: current?.businessName ?? "",
        contact: current?.contact ?? "",
        reason: "",
        customFields: initialArticleFields(
          schema,
          current?.customFields ?? {},
          !!current,
        ),
      });
      setMessage(
        pending.has(key)
          ? "上次写入结果仍待人工核对，当前资料不证明该次请求的执行归属。"
          : "",
      );
    } catch (error) {
      if (!controller.signal.aborted) setMessage(accountError(error));
    }
  }, [form, key, operator, path, target.userId]);
  useEffect(() => {
    void reload();
    const pause = () => {
      active.current?.abort();
      setData(null);
      form.resetFields();
    };
    const hide = () => {
      if (document.visibilityState !== "visible") pause();
    };
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", hide);
    return () => {
      active.current?.abort();
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [reload, form]);
  async function save(status?: "active" | "disabled") {
    if (
      lock.current ||
      pending.has(key) ||
      !data ||
      !active.current ||
      active.current.signal.aborted ||
      document.visibilityState !== "visible"
    )
      return;
    const action = status
      ? "update-status"
      : data.profile
        ? "update"
        : "create";
    if (!operator.permissionKeys.includes(`system:merchant-profile:${action}`))
      return;
    lock.current = true;
    setBusy(true);
    let sent = false;
    const controller = active.current;
    try {
      const values = await form.validateFields(status ? ["reason"] : undefined);
      const reason = String(values.reason ?? "").trim();
      if (!reason || Array.from(reason).length > 500)
        throw Error("请填写1–500字操作原因");
      await verifyAccountIdentity(operator, controller.signal);
      const before = profile(
        await apiRequest<unknown>(path, {
          signal: controller.signal,
          cache: "no-store",
        }),
        target.userId,
      );
      if (before?.version !== data.profile?.version)
        throw Error("资料版本已变化，请重新读取后编辑");
      const patch: Record<string, unknown> = { reason };
      if (before) patch.expectedVersion = before.version;
      if (status) patch.status = status;
      else {
        const name = String(values.businessName ?? "").trim(),
          contact = String(values.contact ?? "").trim() || null;
        if (!before || name !== before.businessName) patch.businessName = name;
        if (!before || contact !== before.contact) patch.contact = contact;
        const fields = writableArticleChanges(
          data.schema,
          values.customFields ?? {},
          before?.customFields ?? {},
        );
        if (Object.keys(fields).length) patch.customFields = fields;
        if (before && Object.keys(patch).length === 2)
          throw Error("资料没有修改");
      }
      controller.signal.throwIfAborted();
      pending.set(key, "in-flight");
      sent = true;
      const result = profile(
        await apiRequest<unknown>(path + (status ? "/status" : ""), {
          method: before ? "PATCH" : "POST",
          body: patch,
          signal: controller.signal,
        }),
        target.userId,
      );
      if (!result) throw Error("写入响应异常");
      pending.delete(key);
      controller.signal.throwIfAborted();
      setMessage("商家资料已保存");
      setData(null);
      form.resetFields();
      onSaved();
    } catch (error) {
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      if (sent) {
        if (definitive) pending.delete(key);
        else pending.set(key, "unknown");
      }
      if (!controller.signal.aborted)
        setMessage(
          sent && !definitive
            ? "写入结果尚未确认。请重新读取并人工核对，禁止自动重发。"
            : error instanceof Error
              ? error.message
              : "保存失败",
        );
    } finally {
      lock.current = false;
      setBusy(false);
      render((v) => v + 1);
    }
  }
  const disabled = busy || pending.has(key);
  return (
    <section
      className={`${styles.panel} ${styles.resetPanel}`}
      aria-label="商家资料管理"
    >
      <h2>商家资料管理</h2>
      <AdminParagraph>
        资料与角色权限分别配置。停用保留雪场与历史收益，已发布雪场需独立下架。
      </AdminParagraph>
      {message ? (
        <AdminParagraph role="status">{message}</AdminParagraph>
      ) : null}
      <Button disabled={busy} onClick={() => void reload()}>
        重新读取商家资料
      </Button>
      {data && pending.get(key) === "unknown" ? (
        <Button
          onClick={() => {
            pending.delete(key);
            render((v) => v + 1);
            setMessage("已人工核对；请基于当前版本重新编辑。不会重发旧请求。");
          }}
        >
          已人工核对，重新编辑
        </Button>
      ) : null}
      {data ? (
        <>
          <AdminParagraph>
            {data.profile
              ? `商家 #${data.profile.merchantId} · ${data.profile.status === "active" ? "启用" : "停用"} · 版本 ${data.profile.version} · ${data.profile.updatedAt}`
              : "该账号尚未建立商家资料"}
          </AdminParagraph>
          <Form
            form={form}
            layout="vertical"
            disabled={disabled}
            onFinish={() => void save()}
          >
            <Form.Item
              name="businessName"
              label="商家名称"
              rules={[{ required: true, whitespace: true, max: 100 }]}
              extra={
                <FormHint>
                  必填，填写真实经营主体名称，最多100字；用于商家身份绑定及业务范围。
                </FormHint>
              }
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              name="contact"
              label="联系信息"
              rules={[{ max: 100 }]}
              extra={
                <FormHint>选填，可填写联系人及联系方式，最多100字。</FormHint>
              }
            >
              <Input maxLength={100} />
            </Form.Item>
            <ArticleCustomFields
              schema={data.schema}
              options={data.options}
              editing={!!data.profile}
            />
            <Form.Item
              name="reason"
              label="操作原因"
              rules={[{ required: true, whitespace: true, max: 500 }]}
              extra={
                <FormHint>
                  必填，说明本次商家资料变更的原因，最多500字，记录在操作审计中。
                </FormHint>
              }
            >
              <Input.TextArea rows={3} maxLength={500} />
            </Form.Item>
            <Space wrap>
              {operator.permissionKeys.includes(
                `system:merchant-profile:${data.profile ? "update" : "create"}`,
              ) ? (
                <Button htmlType="submit" loading={busy} disabled={disabled}>
                  {data.profile ? "保存资料" : "建立商家资料"}
                </Button>
              ) : null}
              {data.profile &&
              operator.permissionKeys.includes(
                "system:merchant-profile:update-status",
              ) ? (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    void save(
                      data.profile!.status === "active" ? "disabled" : "active",
                    )
                  }
                >
                  {data.profile.status === "active"
                    ? "停用商家资料"
                    : "启用商家资料"}
                </Button>
              ) : null}
            </Space>
          </Form>
        </>
      ) : (
        <AdminParagraph>请等待资料读取，或点击重新读取。</AdminParagraph>
      )}
    </section>
  );
}
