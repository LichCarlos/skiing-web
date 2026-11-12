"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useRef, useState } from "react";
import { Button, Space, Spin } from "antd";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import { AssetLibrary } from "@/features/assets/asset-library";
import {
  assetFailure,
  loadReadyAsset,
  uploadImage,
  type AssetImage,
} from "@/features/assets/asset-library-model";
import styles from "@/features/assets/asset-library.module.css";
import {
  AssetPickerRun,
  pickerIdentity,
} from "@/features/assets/asset-picker-run";
import type { CurrentUser } from "@/platform/auth/session-model";

type FieldProps = {
  value?: string | null;
  onChange?(value: string | null): void;
  disabled?: boolean;
  existingImage?: { assetId: string; url: string | null };
  onBusyChange?(busy: boolean): void;
  id?: string;
};
export function AssetImageField(props: FieldProps) {
  const { session } = useSession();
  if (session.status !== "authenticated")
    return (
      <AdminParagraph role="status">请确认登录身份后选择图片</AdminParagraph>
    );
  return (
    <AssetImageWorkspace
      key={pickerIdentity(session.currentUser)}
      {...props}
      operator={session.currentUser}
    />
  );
}
function AssetImageWorkspace({
  value,
  onChange,
  disabled = false,
  existingImage,
  onBusyChange,
  id,
  operator,
}: FieldProps & { operator: CurrentUser }) {
  const permissions = operator.permissionKeys;
  const canRead = permissions.includes("content:asset:list");
  const canUpload = permissions.includes("asset:upload");
  const [image, setImage] = useState<AssetImage>();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const latest = useRef({ value, disabled, onChange, onBusyChange });
  latest.current = { value, disabled, onChange, onBusyChange };
  const [preview] = useState(() => new AssetPickerRun(operator, apiRequest));
  const [uploader] = useState(() => new AssetPickerRun(operator, apiRequest));
  useEffect(() => {
    preview.activate();
    uploader.activate();
    return () => {
      preview.dispose();
      uploader.dispose();
      if (busy.current) latest.current.onBusyChange?.(false);
      busy.current = false;
    };
  }, [preview, uploader]);

  useEffect(() => {
    setImage((current) =>
      !canRead && current?.assetId === value ? current : undefined,
    );
    setError(undefined);
    if (!value || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void preview.execute(
      "content:asset:list",
      (signal) => loadReadyAsset(apiRequest, value, signal),
      {
        done: setImage,
        error: (cause) => setError(assetFailure(cause)),
        settled: () => setLoading(false),
      },
    );
    return () => preview.cancel();
  }, [value, canRead, preview, retry]);

  async function upload(file: File) {
    if (
      !uploader.isActive() ||
      busy.current ||
      latest.current.disabled ||
      !canUpload
    )
      return;
    busy.current = true;
    const initialValue = latest.current.value;
    setUploading(true);
    setError(undefined);
    onBusyChange?.(true);
    await uploader.execute(
      "asset:upload",
      (signal) => uploadImage(apiRequest, file, signal),
      {
        done: (asset) => {
          if (latest.current.value !== initialValue || latest.current.disabled)
            return;
          setImage(asset);
          latest.current.onChange?.(asset.assetId);
        },
        error: (cause) => setError(assetFailure(cause)),
        settled: () => {
          busy.current = false;
          setUploading(false);
          latest.current.onBusyChange?.(false);
        },
      },
    );
  }

  const previewUrl =
    image && image.assetId === value
      ? image.url
      : !canRead && existingImage && existingImage.assetId === value
        ? existingImage.url
        : null;
  return (
    <div className={styles.field} id={id}>
      {loading ? (
        <Spin size="small" />
      ) : previewUrl ? (
        <img src={previewUrl} alt="已选择的图片" className={styles.preview} />
      ) : (
        <span>{value ? "已关联图片" : "尚未选择图片"}</span>
      )}
      {error ? (
        <div role="alert" className={styles.error}>
          <span>{error}</span>
          {value && canRead ? (
            <Button
              type="link"
              onClick={() => setRetry((current) => current + 1)}
            >
              重试预览
            </Button>
          ) : null}
        </div>
      ) : null}
      <Space wrap>
        <AssetLibrary
          selectedIds={value ? [value] : []}
          disabled={disabled || uploading}
          onSelect={(asset) => {
            if (!uploader.isActive() || latest.current.disabled || busy.current)
              return;
            setImage(asset);
            latest.current.onChange?.(asset.assetId);
          }}
        />
        {canUpload ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
            <Button
              disabled={disabled}
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              上传图片
            </Button>
          </>
        ) : null}
        <Button
          disabled={disabled || uploading || !value}
          onClick={() => {
            if (
              uploader.isActive() &&
              !latest.current.disabled &&
              !busy.current
            )
              latest.current.onChange?.(null);
          }}
        >
          移除图片
        </Button>
      </Space>
      {!canRead && !canUpload ? (
        <span className={styles.muted}>
          当前账号没有图片读取或上传权限，已有图片会保留；如需更换请联系管理员。
        </span>
      ) : null}
      <span className={styles.muted}>
        支持 JPEG、PNG、WebP，单张不超过 10 MiB。图片扫描通过后才能使用。
      </span>
    </div>
  );
}
