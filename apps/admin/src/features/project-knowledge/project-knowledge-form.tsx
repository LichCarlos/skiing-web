"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { App, Button, Form, Input, Space, Spin } from "antd";
import { apiRequest } from "@/platform/api";
import { getPageHref } from "@/platform/config";
import { useSession } from "@/platform/auth/session-provider";
import { RequestLane } from "@/platform/api/request-lane";
import { projectKnowledgeEditRoute, routes } from "@/config/routes";
import {
  KnowledgeSession,
  KnowledgeRecovery,
  useKnowledgeWrites,
} from "@/features/project-knowledge/knowledge-session";
import {
  canManageKnowledge,
  knowledgeError,
  KnowledgeInputError,
  type Knowledge,
  type KnowledgeInput,
  type KnowledgeOperator,
} from "@/features/project-knowledge/knowledge-model";
import {
  readKnowledge,
  verifyKnowledgeReader,
  prepareKnowledgeSave,
  saveKnowledge,
} from "@/features/project-knowledge/knowledge-queries";
import styles from "@/features/project-knowledge/knowledge-console.module.css";

export function ProjectKnowledgeForm({ id }: { id?: number }) {
  return (
    <KnowledgeSession
      target={String(id ?? "new")}
      action={id === undefined ? "create" : "update"}
    >
      {(operator) => <KnowledgeFormWorkspace operator={operator} id={id} />}
    </KnowledgeSession>
  );
}
function KnowledgeFormWorkspace({
  operator,
  id,
}: {
  operator: KnowledgeOperator;
  id?: number;
}) {
  const { message } = App.useApp(),
    { retryRestore } = useSession();
  const [form] = Form.useForm<KnowledgeInput>();
  const [item, setItem] = useState<Knowledge>(),
    [created, setCreated] =
      useState<Pick<Knowledge, "projectKnowledgeId" | "title">>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [lane] = useState(() => new RequestLane());
  const writes = useKnowledgeWrites(operator);
  const context = useRef(id);
  context.current = id;
  const fill = useCallback(
    (current: Knowledge | null) => {
      setItem(current ?? undefined);
      form.resetFields();
      form.setFieldsValue(
        current
          ? {
              title: current.title,
              category: current.category,
              content: current.content,
              sourceUrl: current.sourceUrl ?? "",
            }
          : { title: "", category: "", content: "", sourceUrl: "" },
      );
    },
    [form],
  );
  const load = useCallback(async () => {
    if (document.visibilityState !== "visible" || context.current !== id)
      return false;
    writes.gate.activate();
    setItem(undefined);
    form.resetFields();
    setLoading(true);
    setError(undefined);
    setLoadError(undefined);
    return lane.run(
      async (signal) => {
        if (id !== undefined)
          return readKnowledge(apiRequest, operator, id, signal);
        await verifyKnowledgeReader(apiRequest, operator, signal, "create");
        return null;
      },
      fill,
      (cause) => setLoadError(knowledgeError(cause)),
      () => setLoading(false),
    );
  }, [lane, id, operator, fill, writes.gate, form]);
  useEffect(() => {
    void load();
    return () => lane.cancel();
  }, [lane, load]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setItem(undefined);
      form.resetFields();
      setLoading(false);
      setError(undefined);
      setCreated((current) =>
        current
          ? { projectKnowledgeId: current.projectKnowledgeId, title: "" }
          : undefined,
      );
      setLoadError("页面读取已暂停，请点击刷新重新读取项目知识");
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    hide();
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [lane, form]);
  const busy = loading || writes.saving || writes.pending;
  async function save() {
    if (
      document.visibilityState !== "visible" ||
      !writes.gate.isActive() ||
      context.current !== id ||
      busy ||
      writes.gate.isLocked() ||
      (id !== undefined && !item) ||
      created
    )
      return;
    setError(undefined);
    const result = await writes.run(
      id !== undefined
        ? { action: "update", projectKnowledgeId: id }
        : { action: "create", title: form.getFieldValue("title") ?? "" },
      async (signal) => {
        let values: KnowledgeInput;
        try {
          values = await form.validateFields();
        } catch {
          throw new KnowledgeInputError("请先修正表单中的错误");
        }
        signal.throwIfAborted();
        return prepareKnowledgeSave(apiRequest, operator, values, item, signal);
      },
      (body, signal) => saveKnowledge(apiRequest, id, body, signal),
      (saved) => {
        if (id === undefined)
          setCreated({
            projectKnowledgeId: saved.projectKnowledgeId,
            title: saved.title,
          });
        else fill(saved);
        message.success(
          id === undefined ? "项目知识草稿已创建" : "项目知识已保存",
        );
      },
    );
    if (writes.gate.isActive() && result.status === "error")
      setError(result.message);
  }
  const canRead = canManageKnowledge(operator, "list");
  return (
    <main className={`${styles.page} ${styles.form}`}>
      <KnowledgeRecovery operator={operator} writes={writes} reload={load} />
      {loading ? (
        <Spin />
      ) : created ? (
        <section>
          <h1>项目知识草稿已创建</h1>
          <AdminParagraph>
            #{created.projectKnowledgeId} {created.title}
          </AdminParagraph>
          <Space wrap>
            {canRead ? (
              <Link href={routes.projectKnowledge}>返回列表</Link>
            ) : null}
            {canRead && canManageKnowledge(operator, "update") ? (
              <Link
                href={projectKnowledgeEditRoute(created.projectKnowledgeId)}
              >
                编辑已创建内容
              </Link>
            ) : null}
            <Button
              onClick={() =>
                void load().then((ok) => {
                  if (ok) setCreated(undefined);
                })
              }
            >
              继续新建
            </Button>
          </Space>
        </section>
      ) : (
        <>
          <header className={styles.header}>
            <div>
              <h1>{id === undefined ? "新建项目知识" : "编辑项目知识"}</h1>
              {item && !loadError ? (
                <span>
                  状态：{item.status} · 版本{item.version}
                </span>
              ) : id === undefined ? (
                <span>新建内容以草稿保存</span>
              ) : null}
            </div>
            {canRead ? (
              <Link href={routes.projectKnowledge}>返回列表</Link>
            ) : null}
          </header>
          {loadError || error ? (
            <AdminParagraph role="alert">{loadError || error}</AdminParagraph>
          ) : null}
          <AdminParagraph>
            正文支持纯文本或Markdown。请勿填写凭据或个人隐私，后端仍会独立校验。刷新会替换当前输入，请先保留修改。
          </AdminParagraph>
          <Space wrap>
            <Button
              disabled={writes.saving || writes.pending}
              onClick={() => void load()}
            >
              刷新资料
            </Button>
            <Button
              disabled={writes.saving}
              onClick={() => void retryRestore()}
            >
              重新读取身份
            </Button>
          </Space>
          {!loadError ? (
            <Form form={form} layout="vertical" disabled={busy}>
              <Form.Item
                name="title"
                label="标题"
                rules={[{ required: true, whitespace: true }, { max: 200 }]}
                extra={<FormHint>必填，平台知识标题，最多200字。</FormHint>}
              >
                <Input maxLength={200} showCount />
              </Form.Item>
              <Form.Item
                name="category"
                label="分类"
                rules={[{ required: true, whitespace: true }, { max: 80 }]}
                extra={
                  <FormHint>
                    必填，填写知识归类名称，例如“平台说明”，最多80字。
                  </FormHint>
                }
              >
                <Input
                  maxLength={80}
                  showCount
                  placeholder="例如：平台说明、常见问题"
                />
              </Form.Item>
              <Form.Item
                name="sourceUrl"
                label="来源链接"
                rules={[{ max: 2048 }]}
                extra={
                  <FormHint>
                    选填来源链接，最多2048字，便于核对资料出处。
                  </FormHint>
                }
              >
                <Input placeholder="https://..." />
              </Form.Item>
              <Form.Item
                name="content"
                label="正文（纯文本或Markdown）"
                rules={[{ required: true, whitespace: true }, { max: 100000 }]}
                extra={
                  <FormHint>
                    必填，支持纯文本或Markdown，最多100000字；发布及索引按现有流程执行。
                  </FormHint>
                }
              >
                <Input.TextArea rows={20} maxLength={100000} showCount />
              </Form.Item>
              <Space wrap>
                {canRead ? (
                  <Button href={getPageHref(routes.projectKnowledge)}>
                    取消
                  </Button>
                ) : null}
                <Button
                  type="primary"
                  disabled={busy}
                  loading={writes.saving}
                  onClick={() => void save()}
                >
                  保存{item?.status === "published" ? "并保持发布" : "草稿"}
                </Button>
              </Space>
            </Form>
          ) : null}
        </>
      )}
    </main>
  );
}
