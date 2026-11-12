"use client";
import { FormHint } from "@/components/form-hint";
import { customFieldHint } from "@/features/custom-fields/custom-field-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
} from "antd";
import { getPageHref } from "@/platform/config";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { merchantResortEditRoute, routes } from "@/config/routes";
import { uploadImage } from "@/features/assets/asset-library-model";
import {
  ResortSession,
  ResortWriteRecovery,
  useResortWrites,
} from "@/features/merchant-resorts/resort-session";
import {
  readResortForm,
  prepareResortSave,
  saveResort,
  prepareResortCommand,
  runResortCommand,
  verifyResortReader,
} from "@/features/merchant-resorts/resort-queries";
import {
  canUseResorts,
  initialResortInput,
  assertResortReviewSaved,
  normalizeResortFieldValue,
  resortError,
  resortStatuses,
  type ResortInput,
  type ResortOperator,
} from "@/features/merchant-resorts/resort-model";
import styles from "@/features/merchant-resorts/merchant-resort-form.module.css";

export function ResortEditor({ resortId }: { resortId?: number }) {
  return (
    <ResortSession
      target={String(resortId ?? "new")}
      action={resortId === undefined ? "create" : "update"}
    >
      {(operator) => <Editor operator={operator} resortId={resortId} />}
    </ResortSession>
  );
}
function Editor({
  operator,
  resortId,
}: {
  operator: ResortOperator;
  resortId?: number;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ResortInput>();
  const [lane] = useState(() => new RequestLane());
  const [data, setData] =
    useState<Awaited<ReturnType<typeof readResortForm>>>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [cover, setCover] = useState<string | null>(null),
    [gallery, setGallery] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<AbortController | null>(null);
  const uploadLock = useRef(false);
  const writes = useResortWrites(operator);
  const context = useRef({ operator, resortId });
  context.current = { operator, resortId };
  const reload = useCallback(async () => {
    const current = context.current;
    if (
      document.visibilityState !== "visible" ||
      current.operator !== operator ||
      current.resortId !== resortId
    )
      return false;
    writes.gate.activate();
    setLoading(true);
    setError(undefined);
    setData(undefined);
    form.resetFields();
    setCover(null);
    setGallery([]);
    setPreviews({});
    return lane.run(
      (signal) => readResortForm(apiRequest, operator, resortId, signal),
      (result) => {
        const values = initialResortInput(result.item, result.schema);
        setData(result);
        form.setFieldsValue(values);
        setCover(values.coverAssetId ?? null);
        setGallery(values.galleryAssetIds ?? []);
        setPreviews(
          Object.fromEntries([
            ...(result.item?.gallery.map((image) => [
              image.assetId,
              image.url,
            ]) ?? []),
            ...(result.item?.coverAssetId && result.item.coverUrl
              ? [[result.item.coverAssetId, result.item.coverUrl]]
              : []),
          ]),
        );
      },
      (cause) => setError(resortError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, resortId, form, writes.gate]);
  useEffect(() => {
    void reload();
    return () => lane.cancel();
  }, [reload, lane]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      uploadRef.current?.abort();
      uploadRef.current = null;
      uploadLock.current = false;
      setUploading(false);
      setData(undefined);
      form.resetFields();
      setCover(null);
      setGallery([]);
      setPreviews({});
      setLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取雪场");
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
  useEffect(
    () => () => {
      uploadRef.current?.abort();
    },
    [],
  );
  const disabled =
    loading || !data || writes.saving || writes.pending || uploading;
  const values = () => ({
    ...form.getFieldsValue(true),
    coverAssetId: cover,
    galleryAssetIds: [...gallery],
  });
  async function save() {
    if (
      !data ||
      loading ||
      uploading ||
      uploadLock.current ||
      document.visibilityState !== "visible"
    )
      return;
    const result = await writes.run(
      resortId === undefined
        ? { action: "create", name: form.getFieldValue("name") ?? "" }
        : { action: "update", resortId },
      async (signal) => {
        await form.validateFields();
        signal.throwIfAborted();
        return prepareResortSave(
          apiRequest,
          operator,
          { item: data.item, schema: data.schema, values: values() },
          signal,
        );
      },
      (body, signal) => saveResort(apiRequest, resortId, body, signal),
      (saved) => {
        message.success(
          resortId === undefined ? "雪场草稿已创建" : "雪场资料已保存",
        );
        if (resortId === undefined)
          window.location.assign(
            getPageHref(
              canUseResorts(operator, "update")
                ? merchantResortEditRoute(saved.resortId)
                : routes.merchantResorts,
            ),
          );
        else void reload();
      },
    );
    if (result.status === "error") setError(result.message);
  }
  async function submit() {
    if (
      !data?.item ||
      loading ||
      uploading ||
      uploadLock.current ||
      document.visibilityState !== "visible"
    )
      return;
    const item = data.item;
    const result = await writes.run(
      { action: "submit-review", resortId: item.resortId },
      async (signal) => {
        assertResortReviewSaved(item, data.schema, values());
        return prepareResortCommand(
          apiRequest,
          operator,
          item,
          "submit-review",
          signal,
        );
      },
      (current, signal) =>
        runResortCommand(apiRequest, current.resortId, "submit-review", signal),
      () => {
        message.success("已提交管理员审核");
        void reload();
      },
    );
    if (result.status === "error") setError(result.message);
  }
  async function upload(file: File, kind: "cover" | "gallery") {
    if (
      disabled ||
      document.visibilityState !== "visible" ||
      uploadLock.current ||
      writes.gate.isLocked() ||
      !operator.permissionKeys.includes("asset:upload")
    )
      return;
    if (kind === "gallery" && gallery.length >= 30) {
      setError("相册最多30张图片");
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    setError(undefined);
    const controller = new AbortController();
    uploadRef.current = controller;
    try {
      await verifyResortReader(
        apiRequest,
        operator,
        controller.signal,
        resortId === undefined ? "create" : "update",
      );
      const asset = await uploadImage(apiRequest, file, controller.signal);
      await verifyResortReader(
        apiRequest,
        operator,
        controller.signal,
        resortId === undefined ? "create" : "update",
      );
      controller.signal.throwIfAborted();
      if (kind === "cover") setCover(asset.assetId);
      else
        setGallery((ids) =>
          ids.includes(asset.assetId) ? ids : [...ids, asset.assetId],
        );
      if (asset.url) {
        const url = asset.url;
        setPreviews((current) => ({ ...current, [asset.assetId]: url }));
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : resortError(cause));
    } finally {
      if (uploadRef.current === controller) {
        uploadRef.current = null;
        uploadLock.current = false;
        if (!controller.signal.aborted) setUploading(false);
      }
    }
  }
  function fileInput(kind: "cover" | "gallery") {
    return operator.permissionKeys.includes("asset:upload") ? (
      <label>
        上传{kind === "cover" ? "封面" : "相册图片"}
        <input
          type="file"
          aria-label={`上传${kind === "cover" ? "封面" : "相册图片"}`}
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file, kind);
          }}
        />
        <FormHint>
          选择JPEG、PNG或WebP图片；上传后需扫描通过才能关联到雪场。
        </FormHint>
      </label>
    ) : (
      <AdminParagraph>
        当前账号没有图片上传权限，已有图片会保留。
      </AdminParagraph>
    );
  }
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <Link href={routes.merchantResorts}>← 我的雪场</Link>
          <h1>{resortId === undefined ? "新建雪场" : "编辑雪场资料"}</h1>
        </div>
        {data?.item ? (
          <span>
            {resortStatuses[data.item.status as keyof typeof resortStatuses] ??
              data.item.status}
          </span>
        ) : null}
      </header>
      <ResortWriteRecovery
        operator={operator}
        writes={writes}
        reload={reload}
      />
      {loading ? (
        <AdminParagraph role="status">正在读取雪场与表单目录</AdminParagraph>
      ) : null}
      {error ? (
        <section role="alert" className={styles.error}>
          {error}
        </section>
      ) : null}
      <Button
        disabled={writes.saving || uploading}
        onClick={() => {
          if (!uploadLock.current && !writes.gate.isLocked()) void reload();
        }}
      >
        重新读取（丢弃未保存修改）
      </Button>
      {data?.item?.status === "published" ? (
        <AdminParagraph className={styles.notice}>
          保存已发布资料后，雪场将重新进入审核并暂时从公开列表隐藏。
        </AdminParagraph>
      ) : null}
      {data ? (
        <Form
          form={form}
          layout="vertical"
          disabled={disabled}
          className={styles.form}
        >
          <section className={styles.section}>
            <h2>基本资料</h2>
            <div className={styles.grid}>
              <Form.Item
                name="name"
                label="雪场名称"
                rules={[{ required: true, whitespace: true }]}
                extra={
                  <FormHint>必填，填写雪场对外展示的名称，最多100字。</FormHint>
                }
              >
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item
                name="price"
                label="起步票价（元）"
                rules={[{ required: true }]}
                extra={<FormHint>必填，单位为元，填写不小于0的整数。</FormHint>}
              >
                <InputNumber min={0} max={2147483647} precision={0} />
              </Form.Item>
              <Form.Item
                name="openStatus"
                label="营业状态"
                rules={[{ required: true }]}
                extra={
                  <FormHint>
                    必选，按雪场实际营业情况选择；尚未确认时选择“未更新”。
                  </FormHint>
                }
              >
                <Select
                  options={[
                    { value: "open", label: "营业中" },
                    { value: "closed", label: "暂停营业" },
                    { value: "limited", label: "部分开放" },
                    { value: "unknown", label: "未更新" },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="snowCondition"
                label="当前雪况"
                rules={[{ required: true, whitespace: true }]}
                extra={
                  <FormHint>
                    必填，简述当前雪况，最多50字；请及时核对雪场公告。
                  </FormHint>
                }
              >
                <Input maxLength={50} />
              </Form.Item>
              {(
                [
                  ["province", "省份", 50],
                  ["city", "城市", 50],
                  ["district", "区县", 50],
                  ["address", "详细地址", 300],
                  ["openingHours", "开放时间", 200],
                ] as const
              ).map(([name, label, max]) => (
                <Form.Item
                  key={name}
                  name={name}
                  label={label}
                  extra={
                    <FormHint>{`${label}，选填，最多${max}字。`}</FormHint>
                  }
                >
                  <Input maxLength={max} />
                </Form.Item>
              ))}
              <Form.Item
                name="longitude"
                label="经度"
                extra={
                  <FormHint>
                    选填，范围为−180至180；与纬度配套填写，用于地图定位。
                  </FormHint>
                }
              >
                <InputNumber min={-180} max={180} />
              </Form.Item>
              <Form.Item
                name="latitude"
                label="纬度"
                extra={
                  <FormHint>
                    选填，范围为−90至90；与经度配套填写，用于地图定位。
                  </FormHint>
                }
              >
                <InputNumber min={-90} max={90} />
              </Form.Item>
              <Form.Item
                name="fitTagValues"
                label="适配标签"
                extra={
                  <FormHint>
                    选填，可多选已启用的雪场适配标签；选项来自数据字典。
                  </FormHint>
                }
              >
                <Select mode="multiple" options={data.tags} />
              </Form.Item>
            </div>
            <Form.Item
              name="trailSummary"
              label="雪道信息"
              extra={
                <FormHint>
                  选填，介绍雪道数量、难度及开放情况，最多10000字。
                </FormHint>
              }
            >
              <Input.TextArea rows={3} maxLength={10000} />
            </Form.Item>
            <Form.Item
              name="facilitySummary"
              label="设施信息"
              extra={
                <FormHint>
                  选填，介绍租赁、餐饮、停车等设施，最多10000字。
                </FormHint>
              }
            >
              <Input.TextArea rows={3} maxLength={10000} />
            </Form.Item>
            <Form.Item
              name="officialUrl"
              label="官网"
              extra={
                <FormHint>
                  选填，填写完整的 http(s) 官网地址，最多500字。
                </FormHint>
              }
            >
              <Input maxLength={500} />
            </Form.Item>
            <Form.Item
              name="description"
              label="雪场介绍"
              rules={[{ required: true, whitespace: true }]}
              extra={<FormHint>必填，填写雪场介绍，最多1000字。</FormHint>}
            >
              <Input.TextArea rows={5} maxLength={1000} showCount />
            </Form.Item>
            {data.item ? (
              <AdminParagraph>
                管理员评分：{data.item.rating ?? "暂无"}（
                {data.item.ratingCount}次）
              </AdminParagraph>
            ) : null}
          </section>
          <section className={styles.section}>
            <h2>图片</h2>
            <div className={styles.mediaRow}>
              <div>
                <strong>封面</strong>
                {cover ? (
                  <>
                    <code>Asset {cover}</code>
                    {previews[cover] ? (
                      <img
                        src={previews[cover]}
                        alt="雪场封面"
                        width={160}
                        height={100}
                      />
                    ) : null}
                  </>
                ) : (
                  <span>未设置封面</span>
                )}
                {fileInput("cover")}
                <Button
                  disabled={disabled || !cover}
                  onClick={() => setCover(null)}
                >
                  移除封面
                </Button>
              </div>
              <div>
                <strong>相册（{gallery.length}/30）</strong>
                {gallery.map((id, index) => (
                  <div key={id}>
                    <code>Asset {id}</code>
                    {previews[id] ? (
                      <img
                        src={previews[id]}
                        alt={`相册第${index + 1}张`}
                        width={100}
                        height={70}
                      />
                    ) : null}
                    <Space wrap>
                      <Button
                        disabled={disabled || index === 0}
                        onClick={() =>
                          setGallery((ids) => {
                            const next = [...ids];
                            [next[index - 1], next[index]] = [
                              next[index]!,
                              next[index - 1]!,
                            ];
                            return next;
                          })
                        }
                      >
                        上移
                      </Button>
                      <Button
                        disabled={disabled || index === gallery.length - 1}
                        onClick={() =>
                          setGallery((ids) => {
                            const next = [...ids];
                            [next[index + 1], next[index]] = [
                              next[index]!,
                              next[index + 1]!,
                            ];
                            return next;
                          })
                        }
                      >
                        下移
                      </Button>
                      <Button
                        disabled={disabled}
                        onClick={() =>
                          setGallery((ids) =>
                            ids.filter((value) => value !== id),
                          )
                        }
                      >
                        移除
                      </Button>
                    </Space>
                  </div>
                ))}
                {fileInput("gallery")}
              </div>
            </div>
            <AdminParagraph>
              仅限本人上传且扫描通过的 JPEG、PNG、WebP 图片，单张最多10
              MiB。相册顺序即展示顺序。
            </AdminParagraph>
          </section>
          {data.schema.groups.map((group) => (
            <section className={styles.section} key={group.groupKey}>
              <h2>{group.label}</h2>
              <div className={styles.grid}>
                {(group.fields ?? []).map((field) => {
                  if (!field.canWrite)
                    return field.canRead ? (
                      <div key={field.fieldKey}>
                        <strong>{field.label}</strong>
                        <AdminParagraph>
                          {String(
                            data.item?.customFields[field.fieldKey] ?? "—",
                          )}
                        </AdminParagraph>
                      </div>
                    ) : null;
                  const rule = field.validation as {
                    min?: number;
                    max?: number;
                    maxLength?: number;
                  } | null;
                  let control;
                  if (field.dataType === "textarea")
                    control = (
                      <Input.TextArea rows={3} maxLength={rule?.maxLength} />
                    );
                  else if (["integer", "decimal"].includes(field.dataType))
                    control = (
                      <InputNumber
                        precision={field.dataType === "integer" ? 0 : undefined}
                        min={rule?.min}
                        max={rule?.max}
                      />
                    );
                  else if (field.dataType === "boolean")
                    control = (
                      <Select
                        allowClear
                        options={[
                          { value: true, label: "是" },
                          { value: false, label: "否" },
                        ]}
                      />
                    );
                  else if (field.dataType === "date")
                    control = <Input type="date" />;
                  else if (
                    ["single_select", "multi_select"].includes(field.dataType)
                  )
                    control = (
                      <Select
                        allowClear
                        mode={
                          field.dataType === "multi_select"
                            ? "multiple"
                            : undefined
                        }
                        options={
                          field.optionsDictType
                            ? data.dictionaries[field.optionsDictType]
                            : []
                        }
                      />
                    );
                  else
                    control = (
                      <Input
                        type={field.dataType === "url" ? "url" : "text"}
                        maxLength={rule?.maxLength}
                      />
                    );
                  return (
                    <Form.Item
                      key={field.fieldKey}
                      name={["customFields", field.fieldKey]}
                      label={field.label}
                      rules={
                        field.required && (!data.item || field.canRead)
                          ? [{ required: true }]
                          : []
                      }
                      normalize={(value: unknown) =>
                        normalizeResortFieldValue(field.dataType, value)
                      }
                      extra={<FormHint>{customFieldHint(field)}</FormHint>}
                    >
                      {control}
                    </Form.Item>
                  );
                })}
              </div>
            </section>
          ))}
          <footer className={styles.actions}>
            <Space wrap>
              <Button href={getPageHref(routes.merchantResorts)}>
                返回列表
              </Button>
              <Button
                type="primary"
                loading={writes.saving}
                disabled={disabled}
                onClick={() => void save()}
              >
                {resortId === undefined ? "保存草稿" : "保存资料"}
              </Button>
              {data.item &&
              canUseResorts(operator, "submit-review") &&
              ["draft", "offline"].includes(data.item.status) ? (
                <Popconfirm
                  title="提交管理员审核？"
                  description="仅提交已保存资料。未保存修改请先保存。"
                  onConfirm={() => void submit()}
                >
                  <Button disabled={disabled}>提交审核</Button>
                </Popconfirm>
              ) : null}
            </Space>
          </footer>
        </Form>
      ) : null}
    </main>
  );
}
