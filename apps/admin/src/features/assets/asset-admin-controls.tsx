"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { App, Modal } from "antd";
import { apiRequest } from "@/platform/api";
import type {
  AssetOperator,
  AdminAsset,
} from "@/features/assets/asset-admin-model";
import type { AssetDeletions } from "@/features/assets/asset-admin-session";
import {
  prepareAssetDeletion,
  sendAssetDeletion,
} from "@/features/assets/asset-admin-queries";
export function AssetDeleteDialog({
  operator,
  asset,
  writes,
  close,
  committed,
}: {
  operator: AssetOperator;
  asset: AdminAsset;
  writes: AssetDeletions;
  close: () => void;
  committed: () => void;
}) {
  const { message } = App.useApp();
  async function submit() {
    if (document.visibilityState !== "visible" || !writes.gate.isActive())
      return;
    const result = await writes.run(
      { assetId: asset.assetId },
      (signal) => prepareAssetDeletion(apiRequest, operator, asset, signal),
      (id, signal) => sendAssetDeletion(apiRequest, id, signal),
      () => {
        message.success("媒体资源已停用");
        close();
        committed();
      },
    );
    if (writes.gate.isActive() && result.status === "error" && result.uncertain)
      close();
  }
  return (
    <Modal
      open
      title={`停用媒体 #${asset.assetId}`}
      onOk={() => void submit()}
      onCancel={() => {
        if (!writes.gate.isLocked()) close();
      }}
      confirmLoading={writes.saving}
      okButtonProps={{ disabled: writes.pending, danger: true }}
      cancelButtonProps={{ disabled: writes.saving }}
      closable={!writes.saving}
      maskClosable={!writes.saving}
      destroyOnHidden
    >
      <AdminParagraph>{asset.originalName}</AdminParagraph>
      <AdminParagraph>
        停用后将不可用于新的内容关联。被业务引用的媒体不能停用，操作会保留记录。
      </AdminParagraph>
    </Modal>
  );
}
