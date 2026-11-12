"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { App, Button, Form, Input, Select, Space, Spin } from "antd";
import { getPageHref } from "@/platform/config";
import { apiRequest } from "@/platform/api";
import { adminArticleEditRoute, routes } from "@/config/routes";
import { useSession } from "@/platform/auth/session-provider";
import { RequestLane } from "@/platform/api/request-lane";
import { ArticleCustomFields } from "@/features/articles/article-custom-fields";
import { ArticleBodyEditor } from "@/features/articles/article-body-editor";
import { AssetImageField } from "@/features/assets/asset-image-field";
import {
  initialArticleFields,
  type ArticleFieldSchema,
  type ArticleFieldOptions,
} from "@/features/articles/article-field-model";
import {
  ArticleSession,
  ArticleRecovery,
  useArticleWrites,
} from "@/features/articles/article-session";
import {
  readArticleForm,
  prepareArticleSave,
  saveManagedArticle,
  prepareArticleCommand,
  sendArticleCommand,
} from "@/features/articles/article-queries";
import {
  articleError,
  ArticleInputError,
  type ArticleInput,
  type ArticleOperator,
  type ManagedArticle,
} from "@/features/articles/article-model";
import styles from "@/features/articles/article-console.module.css";

export function AdminArticleForm({ articleId }: { articleId?: number }) {
  return (
    <ArticleSession target={String(articleId ?? "new")}>
      {(operator) => (
        <ArticleFormWorkspace operator={operator} articleId={articleId} />
      )}
    </ArticleSession>
  );
}

function ArticleFormWorkspace({
  operator,
  articleId,
}: {
  operator: ArticleOperator;
  articleId?: number;
}) {
  const { message } = App.useApp();
  const { retryRestore } = useSession();
  const writes = useArticleWrites(operator);
  const [form] = Form.useForm<ArticleInput>();
  const contentFormat = Form.useWatch("contentFormat", form);
  const [categories, setCategories] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<ArticleFieldSchema>({
    entityType: "article",
    groups: [],
  });
  const [options, setOptions] = useState<ArticleFieldOptions>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageBusy = useRef(false);
  const coverBusy = useRef(false),
    bodyBusy = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [article, setArticle] = useState<ManagedArticle>();
  const [error, setError] = useState<string>();
  const [lane] = useState(() => new RequestLane());
  const targetId = article?.articleId ?? articleId;
  const busy = writes.saving || writes.pending || uploadingImage || loading;
  const context = useRef({ operator, targetId });
  context.current = { operator, targetId };

  const fill = useCallback(
    (current: ManagedArticle | null, fieldSchema: ArticleFieldSchema) => {
      form.resetFields();
      setArticle(current ?? undefined);
      form.setFieldsValue(
        current
          ? {
              title: current.title,
              summary: current.summary,
              body: current.body,
              contentFormat: current.contentFormat ?? "plain_text",
              categoryValue: current.category.value,
              coverAssetId: current.coverAssetId,
              customFields: initialArticleFields(
                fieldSchema,
                current.customFields,
                true,
              ),
            }
          : {
              title: "",
              summary: "",
              body: "",
              contentFormat: "markdown_v1",
              categoryValue: undefined,
              coverAssetId: null,
              customFields: initialArticleFields(fieldSchema, {}, false),
            },
      );
      setDirty(false);
    },
    [form],
  );

  const load = useCallback(async () => {
    if (
      document.visibilityState !== "visible" ||
      context.current.operator !== operator ||
      context.current.targetId !== targetId
    )
      return false;
    writes.gate.activate();
    setLoading(true);
    setError(undefined);
    return lane.run(
      (signal) => readArticleForm(apiRequest, operator, targetId, signal),
      (data) => {
        setSchema(data.schema);
        setOptions(data.options);
        setCategories(data.categories);
        fill(data.article, data.schema);
      },
      (cause) => setError(articleError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, targetId, fill, writes.gate]);
  useEffect(() => {
    void load();
    return () => lane.cancel();
  }, [lane, load]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      form.resetFields();
      setArticle(undefined);
      setSchema({ entityType: "article", groups: [] });
      setOptions({});
      setCategories([]);
      setDirty(false);
      imageBusy.current = false;
      coverBusy.current = false;
      bodyBusy.current = false;
      setUploadingImage(false);
      setLoading(false);
      setError("页面读取已暂停，请点击重试加载重新读取文章资料");
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

  async function saveArticle() {
    if (
      busy ||
      imageBusy.current ||
      writes.gate.isLocked() ||
      document.visibilityState !== "visible"
    )
      return;
    await writes.run(
      targetId
        ? { action: "save", articleId: targetId }
        : { action: "create", title: form.getFieldValue("title") ?? "" },
      async (signal) => {
        let values: ArticleInput;
        try {
          values = await form.validateFields();
        } catch {
          throw new ArticleInputError("请先修正表单中的错误");
        }
        signal.throwIfAborted();
        return prepareArticleSave(
          apiRequest,
          operator,
          { article, schema, values },
          signal,
        );
      },
      (input, signal) =>
        saveManagedArticle(apiRequest, targetId, input, signal),
      (saved) => {
        fill(saved, schema);
        message.success("文章已保存");
        if (!targetId)
          window.location.assign(
            getPageHref(adminArticleEditRoute(saved.articleId)),
          );
      },
    );
  }
  async function command(action: "publish" | "withdraw") {
    if (
      busy ||
      dirty ||
      !targetId ||
      writes.gate.isLocked() ||
      document.visibilityState !== "visible"
    )
      return;
    await writes.run(
      { action, articleId: targetId },
      (signal) =>
        prepareArticleCommand(
          apiRequest,
          operator,
          targetId,
          action,
          signal,
          article?.version,
        ),
      (id, signal) => sendArticleCommand(apiRequest, id, action, signal),
      () => {
        message.success(action === "publish" ? "文章已发布" : "文章已撤回");
        void load();
      },
    );
  }
  return (
    <main className={`${styles.page} ${styles.form}`}>
      <ArticleRecovery operator={operator} writes={writes} reload={load} />
      {loading ? (
        <Spin />
      ) : error ? (
        <section>
          <h1>文章编辑</h1>
          <AdminParagraph role="alert">{error}</AdminParagraph>
          <Space wrap>
            <Button onClick={() => void load()}>重试加载</Button>
            <Button onClick={() => void retryRestore()}>重新读取身份</Button>
            <Button href={getPageHref(routes.articles)}>返回文章列表</Button>
          </Space>
        </section>
      ) : (
        <>
          <header className={styles.header}>
            <div>
              <h1>{targetId ? "编辑文章" : "新建文章"}</h1>
              {article ? (
                <span>
                  状态：{article.status} · 版本 {article.version}
                </span>
              ) : null}
            </div>
            <Link href={routes.articles}>返回列表</Link>
          </header>
          <AdminParagraph>
            发布与撤回仅操作已保存内容。有修改时请先保存；刷新资料会替换当前输入，请先保留需要的修改。
          </AdminParagraph>
          <Space wrap>
            <Button disabled={busy} onClick={() => void load()}>
              刷新资料
            </Button>
            <Button
              disabled={writes.saving}
              onClick={() => void retryRestore()}
            >
              重新读取身份
            </Button>
          </Space>
          <Form
            form={form}
            layout="vertical"
            disabled={busy}
            onValuesChange={() => setDirty(true)}
          >
            <Form.Item
              name="title"
              label="标题"
              rules={[{ required: true, whitespace: true }, { max: 200 }]}
              extra={<FormHint>必填，文章展示标题，最多200字。</FormHint>}
            >
              <Input showCount maxLength={200} />
            </Form.Item>
            <Form.Item
              name="summary"
              label="摘要"
              rules={[{ required: true, whitespace: true }, { max: 1000 }]}
              extra={<FormHint>必填，简要说明文章内容，最多1000字。</FormHint>}
            >
              <Input.TextArea rows={3} showCount maxLength={1000} />
            </Form.Item>
            <Form.Item
              name="categoryValue"
              label="文章分类"
              rules={[{ required: true }]}
              extra={
                <FormHint>
                  必选，选择已启用的文章分类；选项由数据字典维护。
                </FormHint>
              }
            >
              <Select
                options={categories}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            <Form.Item
              name="coverAssetId"
              label="文章封面"
              extra={
                <FormHint>
                  选填，上传或选择封面图片；扫描通过后才可关联，上传要求见图片控件。
                </FormHint>
              }
            >
              <AssetImageField
                disabled={writes.saving || writes.pending || uploadingImage}
                onBusyChange={(value) => {
                  coverBusy.current = value;
                  imageBusy.current = value || bodyBusy.current;
                  setUploadingImage(imageBusy.current);
                }}
                existingImage={
                  article?.coverAssetId
                    ? { assetId: article.coverAssetId, url: article.coverUrl }
                    : undefined
                }
              />
            </Form.Item>
            <Form.Item name="contentFormat" hidden>
              <Input />
            </Form.Item>
            <Form.Item
              name="body"
              label="正文"
              rules={[{ required: true, whitespace: true }, { max: 100000 }]}
              extra={
                <FormHint>
                  必填，最多100000字。可使用富文本工具编辑；保存草稿后再按需要发布。
                </FormHint>
              }
            >
              <ArticleBodyEditor
                format={
                  contentFormat ?? article?.contentFormat ?? "markdown_v1"
                }
                onFormatChange={(format) => {
                  form.setFieldValue("contentFormat", format);
                  setDirty(true);
                }}
                disabled={
                  writes.saving || writes.pending || loading || uploadingImage
                }
                images={article?.bodyAssets}
                onBusyChange={(value) => {
                  bodyBusy.current = value;
                  imageBusy.current = value || coverBusy.current;
                  setUploadingImage(imageBusy.current);
                }}
              />
            </Form.Item>
            <ArticleCustomFields
              schema={schema}
              options={options}
              editing={Boolean(targetId)}
            />
            <Space wrap>
              <Button href={getPageHref(routes.articles)}>取消</Button>
              <Button
                type="primary"
                disabled={busy}
                loading={writes.saving}
                onClick={() => void saveArticle()}
              >
                保存
              </Button>
              {article && ["draft", "withdrawn"].includes(article.status) ? (
                <Button
                  disabled={busy || dirty}
                  onClick={() => void command("publish")}
                >
                  发布已保存内容
                </Button>
              ) : null}
              {article?.status === "published" ? (
                <Button
                  danger
                  disabled={busy || dirty}
                  onClick={() => void command("withdraw")}
                >
                  撤回已保存内容
                </Button>
              ) : null}
            </Space>
          </Form>
        </>
      )}
    </main>
  );
}
