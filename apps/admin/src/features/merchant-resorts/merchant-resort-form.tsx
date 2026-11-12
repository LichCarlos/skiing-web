"use client";
import { FormHint } from "@/components/form-hint";
import { customFieldHint } from "@/features/custom-fields/custom-field-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { RequestLane } from "@/platform/api/request-lane";
import {
  GlobalResortSession,
  GlobalResortRecovery,
  useGlobalResortWrites,
} from "@/features/admin-resorts/global-resort-session";
import {
  readGlobalResortForm,
  initialGlobalResortInput,
  prepareGlobalResortSave,
  saveGlobalResort,
  type GlobalResortInput,
  type GlobalResortSchema,
} from "@/features/admin-resorts/global-resort-form-api";
import { verifyGlobalReader } from "@/features/admin-resorts/global-resort-api";
import {
  type GlobalResort,
  type GlobalResortOperator,
  GlobalResortError,
} from "@/features/admin-resorts/global-resort-model";
import {
  normalizeResortFieldValue,
  resortError,
} from "@/features/merchant-resorts/resort-model";
import { uploadImage } from "@/features/assets/asset-library-model";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Upload,
} from "antd";
import type { UploadProps } from "antd";
import { getPageHref } from "@/platform/config";
import { apiRequest } from "@/platform/api";
import { routes } from "@/config/routes";
import { AssetLibrary } from "@/features/assets/asset-library";
import { AssetImageField } from "@/features/assets/asset-image-field";
import styles from "@/features/merchant-resorts/merchant-resort-form.module.css";
import { ResortEditor } from "@/features/merchant-resorts/resort-editor";

type FormValues = GlobalResortInput;
type ResortDetail = GlobalResortInput &
  Pick<GlobalResort, "resortId" | "status" | "gallery" | "coverAssetId">;
interface CustomField {
  fieldKey: string;
  label: string;
  dataType: string;
  required: boolean;
  defaultValue: unknown;
  optionsDictType: string | null;
  validation: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  } | null;
  canRead: boolean;
  canWrite: boolean;
}
interface CustomFieldGroup {
  groupKey: string;
  label: string;
  fields: CustomField[];
}
interface Dictionary {
  items: Array<{
    value: string;
    label: string;
    status: string;
    children: Array<{
      value: string;
      label: string;
      status: string;
      children: unknown[];
    }>;
  }>;
}

export function MerchantResortForm(props: {
  resortId?: number;
  scope?: "merchant" | "admin";
}) {
  return props.scope === "admin" ? (
    <GlobalResortSession
      target={String(props.resortId ?? "new")}
      action={props.resortId === undefined ? "create" : "update"}
    >
      {(operator) => (
        <GlobalResortFormWorkspace {...props} operator={operator} />
      )}
    </GlobalResortSession>
  ) : (
    <ResortEditor resortId={props.resortId} />
  );
}

function GlobalResortFormWorkspace({
  operator,
  resortId,
  scope = "admin",
}: {
  resortId?: number;
  scope?: "merchant" | "admin";
  operator: GlobalResortOperator;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const currentUser = operator;
  const permissions = currentUser?.permissionKeys ?? [];
  const isAdmin = scope === "admin";
  const canCreate = permissions.includes(
    isAdmin ? "content:resort:create-all" : "resort:merchant:create",
  );
  const canUpdate = permissions.includes(
    isAdmin ? "content:resort:update-all" : "resort:merchant:update",
  );
  const [detail, setDetail] = useState<ResortDetail>();
  const [tags, setTags] = useState<Dictionary["items"]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldGroup[]>([]);
  const [fieldDictionaries, setFieldDictionaries] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});
  const [galleryAssetIds, setGalleryAssetIds] = useState<string[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<
    Record<string, string>
  >({});
  const [pendingUploads, setPendingUploads] = useState(0);
  const [coverAssetId, setCoverAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [original, setOriginal] = useState<GlobalResort>();
  const [formLane] = useState(() => new RequestLane());
  const formSchema = useRef<GlobalResortSchema | null>(null);
  const writes = useGlobalResortWrites(operator);
  const saving = writes.saving;
  const uploadBusy = useRef(false);
  const uploadRequest = useRef<AbortController | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string>();
  const context = useRef(resortId);
  context.current = resortId;
  const mayEdit = resortId ? canUpdate : canCreate;
  const formCanEdit = mayEdit && ready && !loading && !writes.pending;

  const reload = useCallback(async () => {
    if (document.visibilityState !== "visible" || context.current !== resortId)
      return false;
    writes.gate.activate();
    uploadRequest.current?.abort();
    uploadRequest.current = null;
    uploadBusy.current = false;
    setPendingUploads(0);
    setUploadingImage(false);
    formSchema.current = null;
    setLoading(true);
    setReady(false);
    setError(undefined);
    setDetail(undefined);
    setOriginal(undefined);
    setCustomFields([]);
    setFieldDictionaries({});
    setTags([]);
    form.resetFields();
    setCoverAssetId(null);
    setGalleryAssetIds([]);
    setGalleryPreviews({});

    return formLane.run(
      (signal) => readGlobalResortForm(apiRequest, operator, resortId, signal),
      (data) => {
        const values = initialGlobalResortInput(data.item, data.schema);
        formSchema.current = data.schema;
        setOriginal(data.item);
        setDetail(
          data.item
            ? {
                ...values,
                resortId: data.item.resortId,
                status: data.item.status,
                gallery: data.item.gallery,
                coverAssetId: data.item.coverAssetId,
              }
            : undefined,
        );
        setCustomFields(
          data.schema.groups.map((group) => ({
            groupKey: group.groupKey,
            label: group.label,
            fields: (group.fields ?? []).map((field) => ({
              ...field,
              required: field.required ?? false,
              defaultValue: field.defaultValue ?? null,
              optionsDictType: field.optionsDictType ?? null,
              validation: field.validation as CustomField["validation"],
            })),
          })),
        );
        setTags(
          data.tags.map((tag) => ({ ...tag, status: "active", children: [] })),
        );
        setFieldDictionaries(data.dictionaries);
        setCoverAssetId(data.item?.coverAssetId ?? null);
        setGalleryAssetIds(
          data.item?.gallery.map((image) => image.assetId) ?? [],
        );
        setGalleryPreviews(
          Object.fromEntries(
            data.item?.gallery.map((image) => [image.assetId, image.url]) ?? [],
          ),
        );
        form.setFieldsValue(values);
        setReady(true);
      },
      (cause) => setError(resortError(cause)),
      () => setLoading(false),
    );
  }, [formLane, form, operator, resortId, writes.gate]);
  useEffect(() => {
    void reload();
    return () => {
      formLane.cancel();
      uploadRequest.current?.abort();
    };
  }, [formLane, reload]);
  useEffect(() => {
    const clear = () => {
      formLane.cancel();
      uploadRequest.current?.abort();
      uploadRequest.current = null;
      uploadBusy.current = false;
      formSchema.current = null;
      setReady(false);
      setLoading(false);
      setOriginal(undefined);
      setDetail(undefined);
      form.resetFields();
      setTags([]);
      setCustomFields([]);
      setFieldDictionaries({});
      setGalleryAssetIds([]);
      setGalleryPreviews({});
      setCoverAssetId(null);
      setPendingUploads(0);
      setUploadingImage(false);
      setError("页面读取已暂停，请重新读取雪场资料");
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
  }, [formLane, form]);

  function upload(kind: "cover" | "gallery"): UploadProps["customRequest"] {
    return async ({ file, onSuccess, onError }) => {
      if (
        document.visibilityState !== "visible" ||
        context.current !== resortId ||
        !(file instanceof File) ||
        uploadBusy.current ||
        writes.gate.isLocked() ||
        !formCanEdit ||
        !writes.gate.isActive()
      )
        return;
      if (
        !operator.permissionKeys.includes("asset:upload") ||
        (kind === "gallery" && galleryAssetIds.length >= 30)
      ) {
        onError?.(new Error("缺少上传权限或相册已满"));
        return;
      }
      uploadBusy.current = true;
      const controller = new AbortController();
      uploadRequest.current = controller;
      setPendingUploads(1);
      try {
        await verifyGlobalReader(
          apiRequest,
          operator,
          controller.signal,
          resortId === undefined ? "create" : "update",
        );
        const asset = await uploadImage(apiRequest, file, controller.signal);
        await verifyGlobalReader(
          apiRequest,
          operator,
          controller.signal,
          resortId === undefined ? "create" : "update",
        );
        controller.signal.throwIfAborted();
        if (kind === "cover") setCoverAssetId(asset.assetId);
        else {
          setGalleryAssetIds((ids) =>
            ids.includes(asset.assetId) ? ids : [...ids, asset.assetId],
          );
          if (asset.url)
            setGalleryPreviews((current) => ({
              ...current,
              [asset.assetId]: asset.url!,
            }));
        }
        message.success("图片上传并扫描完成");
        onSuccess?.(asset);
      } catch (cause) {
        if (!controller.signal.aborted)
          onError?.(
            cause instanceof Error ? cause : new Error("Upload failed"),
          );
      } finally {
        if (uploadRequest.current === controller) {
          uploadRequest.current = null;
          uploadBusy.current = false;
          if (!controller.signal.aborted) setPendingUploads(0);
        }
      }
    };
  }

  async function save() {
    if (
      document.visibilityState !== "visible" ||
      context.current !== resortId ||
      !formCanEdit ||
      uploadBusy.current ||
      uploadingImage ||
      pendingUploads > 0
    )
      return;
    const result = await writes.run(
      resortId === undefined
        ? { action: "create", name: form.getFieldValue("name") ?? "" }
        : { action: "update", resortId },
      async (signal) => {
        const values = await form.validateFields();
        signal.throwIfAborted();
        if (uploadBusy.current)
          throw new GlobalResortError("请等待图片上传完成");
        const schema = formSchema.current;
        if (!schema || (resortId !== undefined && !original))
          throw new GlobalResortError("请先重新读取原始资料与字段目录");
        return prepareGlobalResortSave(
          apiRequest,
          operator,
          {
            item: original,
            schema,
            values: { ...values, coverAssetId, galleryAssetIds },
          },
          signal,
        );
      },
      (body, signal) => saveGlobalResort(apiRequest, resortId, body, signal),
      () => {
        message.success(
          resortId === undefined ? "全局雪场已创建" : "雪场资料已保存",
        );
        window.location.assign(getPageHref(routes.adminResorts));
      },
    );
    if (result.status === "error") setError(result.message);
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <Link
            className={styles.back}
            href={isAdmin ? routes.adminResorts : routes.merchantResorts}
          >
            ← 雪场列表
          </Link>
          <h1>
            {resortId
              ? isAdmin
                ? "维护全局雪场"
                : "编辑雪场资料"
              : isAdmin
                ? "新建全局雪场"
                : "新建雪场"}
          </h1>
        </div>
        {detail ? (
          <span className={styles.status}>
            {
              {
                draft: "草稿",
                pending_review: "审核中",
                published: "已发布",
                offline: "已下架",
              }[detail.status]
            }
          </span>
        ) : null}
      </header>
      <GlobalResortRecovery
        operator={operator}
        writes={writes}
        reload={reload}
      />
      {error ? (
        <section className={styles.error} role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button
            disabled={saving || uploadingImage || pendingUploads > 0}
            onClick={() => void reload()}
          >
            重新读取（清除未保存修改）
          </Button>
        </section>
      ) : null}
      {!isAdmin && detail?.status === "published" ? (
        <AdminParagraph className={styles.notice}>
          保存已发布资料后，雪场将重新进入审核并暂时从公开列表隐藏。
        </AdminParagraph>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        disabled={
          !formCanEdit ||
          loading ||
          saving ||
          uploadingImage ||
          pendingUploads > 0
        }
        className={styles.form}
      >
        <section className={styles.section}>
          <h2>基本资料</h2>
          {isAdmin ? (
            <div className={styles.grid}>
              <Form.Item
                label="关联商家 ID"
                name="merchantId"
                extra={
                  <FormHint>
                    选填有效商家ID（正整数），用于关联经营商家；请先在账号管理核对商家资料。
                  </FormHint>
                }
              >
                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                label="管理员评分"
                name="rating"
                extra={
                  <FormHint>选填，管理员评分为0至5分，最多1位小数。</FormHint>
                }
              >
                <InputNumber
                  min={0}
                  max={5}
                  step={0.1}
                  precision={1}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item
                label="评分人数"
                name="ratingCount"
                extra={
                  <FormHint>
                    选填，评分人数为不小于0的整数，请按真实统计填写。
                  </FormHint>
                }
              >
                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </div>
          ) : null}
          <div className={styles.grid}>
            <Form.Item
              label="雪场名称"
              name="name"
              rules={[{ required: true, whitespace: true }]}
              extra={
                <FormHint>必填，填写雪场对外展示的名称，最多100字。</FormHint>
              }
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              label="起步票价（元）"
              name="price"
              rules={[{ required: true }]}
              extra={<FormHint>必填，单位为元，填写不小于0的整数。</FormHint>}
            >
              <InputNumber min={0} precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="营业状态"
              name="openStatus"
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
              label="当前雪况"
              name="snowCondition"
              rules={[{ required: true, whitespace: true }]}
              extra={
                <FormHint>
                  必填，简述当前雪况，最多50字；请及时核对雪场公告。
                </FormHint>
              }
            >
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item
              label="省份"
              name="province"
              extra={
                <FormHint>选填，填写所在省份或直辖市，最多50字。</FormHint>
              }
            >
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item
              label="城市"
              name="city"
              extra={<FormHint>选填，填写所在城市，最多50字。</FormHint>}
            >
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item
              label="区县"
              name="district"
              extra={<FormHint>选填，填写所在区县，最多50字。</FormHint>}
            >
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item
              label="详细地址"
              name="address"
              extra={
                <FormHint>选填，填写可用于到访的详细地址，最多300字。</FormHint>
              }
            >
              <Input maxLength={300} />
            </Form.Item>
            <Form.Item
              label="经度"
              name="longitude"
              extra={
                <FormHint>
                  选填，范围为−180至180；与纬度配套填写，用于地图定位。
                </FormHint>
              }
            >
              <InputNumber min={-180} max={180} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="纬度"
              name="latitude"
              extra={
                <FormHint>
                  选填，范围为−90至90；与经度配套填写，用于地图定位。
                </FormHint>
              }
            >
              <InputNumber min={-90} max={90} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="开放时间"
              name="openingHours"
              extra={<FormHint>选填，填写营业日期及时段，最多200字。</FormHint>}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item
              label="适配标签"
              name="fitTagValues"
              extra={
                <FormHint>
                  选填，可多选已启用的雪场适配标签；选项来自数据字典。
                </FormHint>
              }
            >
              <Select
                mode="multiple"
                options={tags.map((tag) => ({
                  value: tag.value,
                  label: tag.label,
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item
            label="雪道信息"
            name="trailSummary"
            extra={
              <FormHint>
                选填，介绍雪道数量、难度及开放情况，最多10000字。
              </FormHint>
            }
          >
            <Input.TextArea rows={3} maxLength={10000} showCount />
          </Form.Item>
          <Form.Item
            label="设施信息"
            name="facilitySummary"
            extra={
              <FormHint>
                选填，介绍租赁、餐饮、停车等设施，最多10000字。
              </FormHint>
            }
          >
            <Input.TextArea rows={3} maxLength={10000} showCount />
          </Form.Item>
          <Form.Item
            label="官网"
            name="officialUrl"
            rules={[{ type: "url", message: "请输入完整的 http(s) 地址" }]}
            extra={
              <FormHint>
                选填，填写完整的 http(s) 官网地址，最多500字。
              </FormHint>
            }
          >
            <Input maxLength={500} />
          </Form.Item>
          <Form.Item
            label="雪场介绍"
            name="description"
            rules={[{ required: true, whitespace: true }]}
            extra={<FormHint>必填，填写雪场介绍，最多1000字。</FormHint>}
          >
            <Input.TextArea rows={5} maxLength={1000} showCount />
          </Form.Item>
        </section>
        <section className={styles.section}>
          <h2>图片</h2>
          <div className={styles.mediaRow}>
            <div>
              <strong>封面</strong>
              {isAdmin && ready ? (
                <AssetImageField
                  value={coverAssetId}
                  onChange={(value) => {
                    if (
                      document.visibilityState === "visible" &&
                      writes.gate.isActive()
                    )
                      setCoverAssetId(value);
                  }}
                  disabled={!formCanEdit || saving}
                  onBusyChange={(busy) => {
                    uploadBusy.current = busy;
                    setUploadingImage(busy);
                  }}
                />
              ) : isAdmin ? null : (
                <>
                  <div>
                    {coverAssetId ? (
                      <code>Asset {coverAssetId}</code>
                    ) : (
                      <span className={styles.muted}>未设置</span>
                    )}
                  </div>
                  <Upload
                    accept="image/jpeg,image/png,image/webp"
                    showUploadList={false}
                    customRequest={upload("cover")}
                    disabled={
                      !formCanEdit ||
                      saving ||
                      uploadingImage ||
                      !permissions.includes("asset:upload")
                    }
                  >
                    <Button>上传封面</Button>
                  </Upload>
                  <Button
                    disabled={!coverAssetId}
                    onClick={() => setCoverAssetId(null)}
                  >
                    移除
                  </Button>
                </>
              )}
            </div>
            <div>
              <strong>相册</strong>
              {isAdmin && ready ? (
                <AssetLibrary
                  disabled={
                    !formCanEdit ||
                    saving ||
                    uploadingImage ||
                    pendingUploads > 0
                  }
                  selectedIds={galleryAssetIds}
                  label="从媒体库添加相册图片"
                  onSelect={(asset) => {
                    if (
                      document.visibilityState !== "visible" ||
                      !writes.gate.isActive() ||
                      galleryAssetIds.length >= 30
                    )
                      return;
                    setGalleryAssetIds((ids) =>
                      ids.includes(asset.assetId)
                        ? ids
                        : [...ids, asset.assetId],
                    );
                    if (asset.url) {
                      const url = asset.url;
                      setGalleryPreviews((current) => ({
                        ...current,
                        [asset.assetId]: url,
                      }));
                    }
                  }}
                />
              ) : null}
              <div className={styles.assetList}>
                {galleryAssetIds.map((id, index) => (
                  <span key={id}>
                    {galleryPreviews[id] ? (
                      <img
                        src={galleryPreviews[id]}
                        alt="已选择的雪场相册图片"
                        width={100}
                        height={70}
                        style={{ objectFit: "contain" }}
                      />
                    ) : null}
                    <code>Asset {id}</code>
                    {([-1, 1] as const).map((delta) => (
                      <Button
                        key={delta}
                        size="small"
                        aria-label={`${delta === -1 ? "上移" : "下移"} Asset ${id}`}
                        disabled={
                          !formCanEdit ||
                          saving ||
                          uploadingImage ||
                          pendingUploads > 0 ||
                          index + delta < 0 ||
                          index + delta >= galleryAssetIds.length
                        }
                        onClick={() =>
                          setGalleryAssetIds((ids) => {
                            const image = ids[index];
                            if (!image) return ids;
                            const next = ids.filter((_, i) => i !== index);
                            next.splice(index + delta, 0, image);
                            return next;
                          })
                        }
                      >
                        {delta === -1 ? "上移" : "下移"}
                      </Button>
                    ))}
                    <Button
                      type="text"
                      size="small"
                      aria-label={`移除 Asset ${id}`}
                      disabled={
                        !formCanEdit ||
                        saving ||
                        uploadingImage ||
                        pendingUploads > 0
                      }
                      onClick={() =>
                        setGalleryAssetIds((ids) =>
                          ids.filter((value) => value !== id),
                        )
                      }
                    >
                      移除
                    </Button>
                  </span>
                ))}
              </div>
              <Upload
                accept="image/jpeg,image/png,image/webp"
                showUploadList={false}
                customRequest={upload("gallery")}
                disabled={
                  !formCanEdit ||
                  saving ||
                  uploadingImage ||
                  !permissions.includes("asset:upload")
                }
              >
                <Button>上传相册图片</Button>
              </Upload>
            </div>
          </div>
          <AdminParagraph className={styles.muted}>
            图片上传后由服务端扫描；只有扫描通过的资源会关联到雪场。
          </AdminParagraph>
        </section>
        {customFields.map((group) => (
          <section className={styles.section} key={group.groupKey}>
            <h2>{group.label}</h2>
            <div className={styles.grid}>
              {group.fields.map((field) => {
                const rules = field.validation ?? {};
                const itemRules =
                  field.canWrite &&
                  field.required &&
                  (resortId === undefined || field.canRead)
                    ? [{ required: true, message: `${field.label}为必填项` }]
                    : [];
                let control;
                if (!field.canWrite) {
                  control = (
                    <span>
                      {String(
                        form.getFieldValue(["customFields", field.fieldKey]) ??
                          "—",
                      )}
                    </span>
                  );
                } else if (field.dataType === "textarea") {
                  control = (
                    <Input.TextArea rows={3} maxLength={rules.maxLength} />
                  );
                } else if (
                  field.dataType === "integer" ||
                  field.dataType === "decimal"
                ) {
                  control = (
                    <InputNumber
                      precision={field.dataType === "integer" ? 0 : undefined}
                      min={rules.min}
                      max={rules.max}
                      style={{ width: "100%" }}
                    />
                  );
                } else if (field.dataType === "boolean") {
                  control = (
                    <Select
                      options={[
                        { value: true, label: "是" },
                        { value: false, label: "否" },
                      ]}
                    />
                  );
                } else if (field.dataType === "date") {
                  control = <Input type="date" />;
                } else if (
                  field.dataType === "single_select" ||
                  field.dataType === "multi_select"
                ) {
                  control = (
                    <Select
                      mode={
                        field.dataType === "multi_select"
                          ? "multiple"
                          : undefined
                      }
                      loading={Boolean(
                        field.optionsDictType &&
                        !fieldDictionaries[field.optionsDictType],
                      )}
                      options={
                        field.optionsDictType
                          ? fieldDictionaries[field.optionsDictType]
                          : []
                      }
                    />
                  );
                } else {
                  control = <Input maxLength={rules.maxLength} />;
                }
                return (
                  <Form.Item
                    key={field.fieldKey}
                    label={field.label}
                    name={["customFields", field.fieldKey]}
                    normalize={(value) =>
                      normalizeResortFieldValue(field.dataType, value)
                    }
                    rules={itemRules}
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
          <Space>
            <Button disabled={saving} href={getPageHref(routes.adminResorts)}>
              取消
            </Button>
            <Button
              type="primary"
              loading={saving || loading}
              disabled={
                !formCanEdit || uploadingImage || saving || pendingUploads > 0
              }
              onClick={() => void save()}
            >
              {resortId ? "保存资料" : "保存草稿"}
            </Button>
          </Space>
        </footer>
      </Form>
    </main>
  );
}
