"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Pagination, Space } from "antd";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import {
  assetFailure,
  assetPageSize,
  loadAssetPage,
  loadReadyAsset,
  type AdminAsset,
  type AssetPage,
} from "@/features/assets/asset-library-model";
import { AssetLibraryResults } from "@/features/assets/asset-library-results";
import {
  AssetPickerRun,
  pickerIdentity,
} from "@/features/assets/asset-picker-run";
import type { CurrentUser } from "@/platform/auth/session-model";

export function AssetLibrary({
  onSelect,
  selectedIds = [],
  disabled = false,
  label = "从媒体库选择",
}: {
  onSelect(asset: AdminAsset): void;
  selectedIds?: readonly string[];
  disabled?: boolean;
  label?: string;
}) {
  const { session } = useSession();
  const [openFor, setOpenFor] = useState<string>();
  const canRead =
    session.status === "authenticated" &&
    session.currentUser.permissionKeys.includes("content:asset:list");
  if (!canRead) return null;
  const identity = pickerIdentity(session.currentUser);
  return (
    <>
      <Button disabled={disabled} onClick={() => setOpenFor(identity)}>
        {label}
      </Button>
      {openFor === identity && !disabled ? (
        <AssetLibraryDialog
          key={identity}
          operator={session.currentUser}
          selectedIds={selectedIds}
          onClose={() => setOpenFor(undefined)}
          onSelect={(asset) => {
            onSelect(asset);
            setOpenFor(undefined);
          }}
        />
      ) : null}
    </>
  );
}

function AssetLibraryDialog({
  operator,
  onSelect,
  onClose,
  selectedIds,
}: {
  operator: CurrentUser;
  onSelect(asset: AdminAsset): void;
  onClose(): void;
  selectedIds: readonly string[];
}) {
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState({ keyword: "", page: 1, retry: 0 });
  return (
    <Modal open title="选择图片" footer={null} onCancel={onClose} width={800}>
      <AdminParagraph>
        仅可选择扫描通过的图片，保存时会再次检查图片状态。
      </AdminParagraph>
      <ControlHint hint="选填，按文件名搜索当前可选择的已就绪图片。">
        <Input.Search
          value={keyword}
          maxLength={100}
          allowClear
          placeholder="按文件名搜索"
          onChange={(event) => setKeyword(event.target.value)}
          onSearch={() =>
            setQuery({
              keyword: keyword.trim(),
              page: 1,
              retry: query.retry + 1,
            })
          }
        />
      </ControlHint>
      <AssetLibraryPage
        operator={operator}
        key={`${query.page}:${query.keyword}:${query.retry}`}
        page={query.page}
        keyword={query.keyword}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onRetry={() =>
          setQuery((current) => ({ ...current, retry: current.retry + 1 }))
        }
        onPage={(page) => setQuery((current) => ({ ...current, page }))}
      />
    </Modal>
  );
}

function AssetLibraryPage({
  operator,
  page,
  keyword,
  selectedIds,
  onSelect,
  onRetry,
  onPage,
}: {
  operator: CurrentUser;
  page: number;
  keyword: string;
  selectedIds: readonly string[];
  onSelect(asset: AdminAsset): void;
  onRetry(): void;
  onPage(page: number): void;
}) {
  const [result, setResult] = useState<AssetPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectionError, setSelectionError] = useState<string>();
  const [selectingId, setSelectingId] = useState<string>();
  const selecting = useRef(false);
  const [reader] = useState(() => new AssetPickerRun(operator, apiRequest));
  const [selector] = useState(() => new AssetPickerRun(operator, apiRequest));
  useEffect(() => {
    reader.activate();
    selector.activate();
    void reader.execute(
      "content:asset:list",
      (signal) => loadAssetPage(apiRequest, page, keyword, signal),
      {
        done: setResult,
        error: (cause) => setError(assetFailure(cause)),
        settled: () => setLoading(false),
      },
    );
    return () => {
      reader.dispose();
      selector.dispose();
      selecting.current = false;
    };
  }, [reader, selector, page, keyword]);

  async function choose(asset: AdminAsset) {
    if (selecting.current || selectedIds.includes(asset.assetId)) return;
    selecting.current = true;
    setSelectingId(asset.assetId);
    setSelectionError(undefined);
    await selector.execute(
      "content:asset:list",
      (signal) => loadReadyAsset(apiRequest, asset.assetId, signal),
      {
        done: onSelect,
        error: (cause) => setSelectionError(assetFailure(cause)),
        settled: () => {
          setSelectingId(undefined);
          selecting.current = false;
        },
      },
    );
  }

  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      {selectionError ? (
        <AdminParagraph role="alert">{selectionError}</AdminParagraph>
      ) : null}
      <AssetLibraryResults
        items={result?.items ?? []}
        loading={loading}
        error={error}
        selectingId={selectingId}
        selectedIds={selectedIds}
        onRetry={onRetry}
        onSelect={(asset) => void choose(asset)}
      />
      {!error && result ? (
        <Pagination
          current={page}
          pageSize={assetPageSize}
          total={result.total}
          showSizeChanger={false}
          disabled={Boolean(selectingId)}
          onChange={onPage}
        />
      ) : null}
    </Space>
  );
}
