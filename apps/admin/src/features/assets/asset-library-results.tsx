"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { Button, Empty, Spin } from "antd";
import {
  isSelectableImage,
  type AdminAsset,
} from "@/features/assets/asset-library-model";
import styles from "@/features/assets/asset-library.module.css";

export function AssetLibraryResults({
  items,
  loading,
  error,
  selectingId,
  selectedIds,
  onRetry,
  onSelect,
}: {
  items: AdminAsset[];
  loading: boolean;
  error?: string;
  selectingId?: string;
  selectedIds: readonly string[];
  onRetry(): void;
  onSelect(asset: AdminAsset): void;
}) {
  if (loading)
    return (
      <div role="status">
        <Spin /> 正在加载图片
      </div>
    );
  if (error)
    return (
      <div role="alert">
        <AdminParagraph>{error}</AdminParagraph>
        <Button onClick={onRetry}>重试加载</Button>
      </div>
    );
  if (!items.length) return <Empty description="没有符合条件的图片" />;
  return (
    <div className={styles.grid}>
      {items.map((asset) => {
        const valid = isSelectableImage(asset);
        const selected = selectedIds.includes(asset.assetId);
        return (
          <article key={asset.assetId} className={styles.card}>
            {valid ? (
              <img
                src={asset.url!}
                alt={asset.originalName}
                className={styles.thumbnail}
              />
            ) : (
              <AdminParagraph>图片暂不可用</AdminParagraph>
            )}
            <strong className={styles.filename}>{asset.originalName}</strong>
            <span className={styles.muted}>上传者：{asset.ownerAccount}</span>
            <Button
              disabled={!valid || selected || Boolean(selectingId)}
              loading={selectingId === asset.assetId}
              onClick={() => onSelect(asset)}
            >
              {selected ? "已选择" : "选择图片"}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
