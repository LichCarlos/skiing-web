"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Select, Space, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { adminAssetRoute, routes } from "@/config/routes";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { useSession } from "@/platform/auth/session-provider";
import {
  assetAdminError,
  assetSize,
  assetReferenceCount,
  assetStatuses,
  canManageAssets,
  type AssetOperator,
  type AdminAsset,
  type AssetPage,
} from "@/features/assets/asset-admin-model";
import { readAssetInventory } from "@/features/assets/asset-admin-queries";
import {
  AssetAdminSession,
  AssetDeletionRecovery,
  useAssetDeletions,
} from "@/features/assets/asset-admin-session";
import { AssetDeleteDialog } from "@/features/assets/asset-admin-controls";
import styles from "@/features/assets/asset-admin.module.css";
export default function AssetAdminConsole() {
  return (
    <AssetAdminSession target="list">
      {(operator) => <AssetWorkspace operator={operator} />}
    </AssetAdminSession>
  );
}
function AssetWorkspace({ operator }: { operator: AssetOperator }) {
  const { retryRestore } = useSession(),
    writes = useAssetDeletions(operator);
  const [input, setInput] = useState(""),
    [ownerInput, setOwnerInput] = useState("");
  const [query, setQuery] = useState({
    keyword: "",
    ownerUserId: "",
    page: 1,
    attempt: 0,
  });
  const [status, setStatus] = useState<AdminAsset["status"]>();
  const [data, setData] = useState<AssetPage>(),
    [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true),
    [target, setTarget] = useState<AdminAsset>();
  const [lane] = useState(() => new RequestLane());
  const key = JSON.stringify([query, status]);
  const context = useRef(key);
  context.current = key;
  const [dataKey, setDataKey] = useState(key);
  const visibleData = dataKey === key ? data : undefined;
  const load = useCallback(async () => {
    if (document.visibilityState !== "visible" || context.current !== key)
      return false;
    writes.gate.activate();
    setDataKey(key);
    setLoading(true);
    setData(undefined);
    setError(undefined);
    return lane.run(
      (signal) =>
        readAssetInventory(apiRequest, operator, { ...query, status }, signal),
      setData,
      (cause) => setError(assetAdminError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, query, status, key, writes.gate]);
  useEffect(() => {
    void load();
    return () => lane.cancel();
  }, [lane, load]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setData(undefined);
      setTarget(undefined);
      setInput("");
      setOwnerInput("");
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
  const busy = loading || writes.saving || writes.pending || Boolean(target),
    canDelete = canManageAssets(operator, "delete");
  const columns: TableColumnsType<AdminAsset> = [
    {
      title: "文件",
      key: "file",
      render: (_, row) => (
        <Space>
          {row.url ? (
            <img
              src={row.url}
              width={44}
              height={44}
              alt=""
              className={styles.thumbnail}
            />
          ) : null}
          <div>
            <Link href={adminAssetRoute(row.assetId)}>{row.originalName}</Link>
            <div>
              {row.mimeType} · {assetSize(row.sizeBytes)}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "上传账号",
      key: "owner",
      render: (_, row) => `${row.ownerAccount} (#${row.ownerUserId})`,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: AdminAsset["status"]) => (
        <Tag>{assetStatuses[value]}</Tag>
      ),
    },
    {
      title: "引用数",
      key: "references",
      render: (_, row) => assetReferenceCount(row),
    },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => new Date(value).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, row) => (
        <Space wrap>
          <Link href={adminAssetRoute(row.assetId)}>详情 / 引用</Link>
          {canDelete &&
          row.status !== "deleted" &&
          assetReferenceCount(row) === 0 ? (
            <Button
              type="link"
              danger
              disabled={busy}
              onClick={() => setTarget(row)}
            >
              停用
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>媒体资源</h1>
          <AdminParagraph>
            查看上传者、扫描状态和业务引用；已被引用的资源禁止停用。
          </AdminParagraph>
        </div>
        <Link href={routes.admin}>返回工作台</Link>
      </header>
      <AssetDeletionRecovery
        operator={operator}
        writes={writes}
        reload={load}
      />
      <Space wrap className={styles.filters}>
        <ControlHint hint="选填，按上传文件名称查询，最多100字。">
          <Input.Search
            className={styles.search}
            value={input}
            maxLength={100}
            allowClear
            disabled={writes.saving || Boolean(target)}
            onChange={(event) => setInput(event.target.value)}
            onSearch={(value) => {
              if (!writes.saving && !target)
                setQuery((current) => ({
                  keyword: value.trim(),
                  ownerUserId: ownerInput.trim(),
                  page: 1,
                  attempt: current.attempt + 1,
                }));
            }}
            placeholder="按文件名搜索"
          />
        </ControlHint>
        <ControlHint hint="选填，填写上传账号的用户ID（正整数），最多10位。">
          <Input
            aria-label="上传账号编号"
            className={styles.owner}
            value={ownerInput}
            maxLength={10}
            allowClear
            disabled={writes.saving || Boolean(target)}
            onChange={(event) => setOwnerInput(event.target.value)}
            placeholder="上传账号编号"
          />
        </ControlHint>
        <Button
          disabled={writes.saving || Boolean(target)}
          onClick={() =>
            setQuery((current) => ({
              keyword: input.trim(),
              ownerUserId: ownerInput.trim(),
              page: 1,
              attempt: current.attempt + 1,
            }))
          }
        >
          应用筛选
        </Button>
        <ControlHint hint="选填，按资源扫描或使用状态筛选；清空表示全部状态。">
          <Select<AdminAsset["status"]>
            value={status}
            allowClear
            disabled={writes.saving || Boolean(target)}
            placeholder="全部状态"
            style={{ width: 150 }}
            onChange={(value) => {
              setStatus(value);
              setQuery((current) => ({ ...current, page: 1 }));
            }}
            options={Object.entries(assetStatuses).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </ControlHint>
        <Button
          disabled={writes.saving || Boolean(target)}
          onClick={() => void load()}
        >
          刷新
        </Button>
        <Button disabled={writes.saving} onClick={() => void retryRestore()}>
          重新读取身份
        </Button>
      </Space>
      {error ? (
        <section role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button onClick={() => void load()}>重试</Button>
        </section>
      ) : (
        <div className={styles.table}>
          <Table
            rowKey="assetId"
            columns={columns}
            loading={loading}
            dataSource={visibleData?.items ?? []}
            locale={{ emptyText: "暂无符合条件的媒体" }}
            pagination={{
              current: query.page,
              pageSize: 20,
              total: visibleData?.total ?? 0,
              disabled: writes.saving || Boolean(target),
              onChange: (page) => setQuery((current) => ({ ...current, page })),
              showSizeChanger: false,
            }}
          />
        </div>
      )}
      {!loading &&
      !error &&
      visibleData?.items.length === 0 &&
      query.page > 1 ? (
        <Button
          onClick={() =>
            setQuery((current) => ({ ...current, page: current.page - 1 }))
          }
        >
          返回上一页
        </Button>
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
