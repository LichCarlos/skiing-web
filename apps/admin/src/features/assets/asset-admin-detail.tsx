"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Descriptions, Space, Tag } from "antd";
import { ApiError } from "@common/api-contracts/client";
import { routes } from "@/config/routes";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { useSession } from "@/platform/auth/session-provider";
import {
  assetAdminError,
  assetSize,
  assetReferenceCount,
  assetReferenceLabels,
  assetStatuses,
  canManageAssets,
  type AssetOperator,
  type AdminAsset,
} from "@/features/assets/asset-admin-model";
import { readAdminAsset } from "@/features/assets/asset-admin-queries";
import {
  AssetAdminSession,
  AssetDeletionRecovery,
  useAssetDeletions,
} from "@/features/assets/asset-admin-session";
import { AssetDeleteDialog } from "@/features/assets/asset-admin-controls";
import styles from "@/features/assets/asset-admin.module.css";
export function AssetAdminDetail({ assetId }: { assetId: string }) {
  return (
    <AssetAdminSession target={assetId}>
      {(operator) => <DetailWorkspace operator={operator} assetId={assetId} />}
    </AssetAdminSession>
  );
}
function DetailWorkspace({
  operator,
  assetId,
}: {
  operator: AssetOperator;
  assetId: string;
}) {
  const { retryRestore } = useSession(),
    writes = useAssetDeletions(operator);
  const [asset, setAsset] = useState<AdminAsset>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(true),
    [target, setTarget] = useState<AdminAsset>();
  const [lane] = useState(() => new RequestLane());
  const context = useRef(assetId);
  context.current = assetId;
  const load = useCallback(
    async (forReview = false) => {
      if (document.visibilityState !== "visible" || context.current !== assetId)
        return false;
      writes.gate.activate();
      setLoading(true);
      setAsset(undefined);
      setError(undefined);
      let missing = false;
      const ok = await lane.run(
        (signal) => readAdminAsset(apiRequest, operator, assetId, signal),
        setAsset,
        (cause) => {
          missing = cause instanceof ApiError && cause.status === 404;
          setError(assetAdminError(cause));
        },
        () => setLoading(false),
      );
      return ok || (forReview && missing);
    },
    [lane, operator, assetId, writes.gate],
  );
  useEffect(() => {
    void load();
    return () => lane.cancel();
  }, [lane, load]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setAsset(undefined);
      setTarget(undefined);
      setLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取媒体");
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
  }, [lane]);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>媒体详情</h1>
          <span>#{assetId}</span>
        </div>
        <Link href={routes.adminAssets}>返回媒体列表</Link>
      </header>
      <AssetDeletionRecovery
        operator={operator}
        writes={writes}
        reload={() => load(true)}
      />
      <Space wrap>
        <Button
          disabled={writes.saving || Boolean(target)}
          onClick={() => void load()}
        >
          刷新资料和预览
        </Button>
        <Button disabled={writes.saving} onClick={() => void retryRestore()}>
          重新读取身份
        </Button>
      </Space>
      {loading ? (
        <AdminParagraph role="status">正在加载媒体…</AdminParagraph>
      ) : error ? (
        <section role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button onClick={() => void load()}>重试</Button>
        </section>
      ) : asset ? (
        <>
          <Descriptions
            className={styles.facts}
            bordered
            column={1}
            items={[
              { key: "name", label: "文件名", children: asset.originalName },
              {
                key: "owner",
                label: "上传账号",
                children: `${asset.ownerAccount} (#${asset.ownerUserId})`,
              },
              { key: "mime", label: "格式", children: asset.mimeType },
              {
                key: "size",
                label: "大小",
                children: assetSize(asset.sizeBytes),
              },
              {
                key: "status",
                label: "状态",
                children: <Tag>{assetStatuses[asset.status]}</Tag>,
              },
              {
                key: "created",
                label: "上传时间",
                children: new Date(asset.createdAt).toLocaleString("zh-CN"),
              },
              ...Object.entries(assetReferenceLabels).map(([key, label]) => ({
                key,
                label,
                children:
                  asset.references[key as keyof typeof asset.references],
              })),
            ]}
          />
          {asset.url ? (
            <>
              <img
                key={asset.url}
                className={styles.preview}
                src={asset.url}
                alt={asset.originalName}
              />
              <AdminParagraph>
                预览暂时不可用或链接过期时，请刷新资料。
              </AdminParagraph>
            </>
          ) : (
            <AdminParagraph>该媒体当前没有可用预览。</AdminParagraph>
          )}
          {canManageAssets(operator, "delete") &&
          asset.status !== "deleted" &&
          assetReferenceCount(asset) === 0 ? (
            <Button
              danger
              disabled={writes.saving || writes.pending || Boolean(target)}
              onClick={() => setTarget(asset)}
            >
              停用媒体
            </Button>
          ) : assetReferenceCount(asset) > 0 ? (
            <AdminParagraph>该媒体正在被引用，不能停用。</AdminParagraph>
          ) : null}
        </>
      ) : null}
      {target ? (
        <AssetDeleteDialog
          operator={operator}
          asset={target}
          writes={writes}
          close={() => setTarget(undefined)}
          committed={() => void load()}
        />
      ) : null}
    </main>
  );
}
