"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { App, Button, Popconfirm, Select, Space, Table } from "antd";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { merchantResortEditRoute, routes } from "@/config/routes";
import {
  ResortSession,
  ResortWriteRecovery,
  useResortWrites,
} from "@/features/merchant-resorts/resort-session";
import {
  readResortPage,
  prepareResortCommand,
  runResortCommand,
} from "@/features/merchant-resorts/resort-queries";
import {
  canUseResorts,
  resortError,
  resortStatuses,
  type MerchantResort,
  type ResortOperator,
  type ResortPage,
} from "@/features/merchant-resorts/resort-model";
import styles from "@/app/admin/merchant/resorts/page.module.css";
export function MerchantResortList() {
  return (
    <ResortSession target="list">
      {(operator) => <Inventory operator={operator} />}
    </ResortSession>
  );
}
function Inventory({ operator }: { operator: ResortOperator }) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState<string>();
  const [result, setResult] = useState<ResortPage>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [lane] = useState(() => new RequestLane());
  const writes = useResortWrites(operator);
  const context = useRef({ operator, page, status });
  context.current = { operator, page, status };
  const reload = useCallback(async () => {
    const current = context.current;
    if (
      document.visibilityState !== "visible" ||
      current.operator !== operator ||
      current.page !== page ||
      current.status !== status
    )
      return false;
    writes.gate.activate();
    setLoading(true);
    setResult(undefined);
    setError(undefined);
    return lane.run(
      (signal) => readResortPage(apiRequest, operator, page, status, signal),
      setResult,
      (cause) => setError(resortError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, page, status, writes.gate]);
  useEffect(() => {
    void reload();
    return () => lane.cancel();
  }, [reload, lane]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setResult(undefined);
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
  }, [lane]);
  async function archive(item: MerchantResort) {
    if (
      loading ||
      writes.gate.isLocked() ||
      document.visibilityState !== "visible"
    )
      return;
    await writes.run(
      { action: "delete", resortId: item.resortId },
      (signal) =>
        prepareResortCommand(apiRequest, operator, item, "delete", signal),
      (current, signal) =>
        runResortCommand(apiRequest, current.resortId, "delete", signal),
      () => {
        message.success("雪场资料已停用");
        void reload();
      },
    );
  }
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>我的雪场</h1>
        </div>
        {canUseResorts(operator, "create") ? (
          <Link href={routes.newMerchantResort}>新建雪场</Link>
        ) : null}
      </header>
      <ResortWriteRecovery
        operator={operator}
        writes={writes}
        reload={reload}
      />
      <section className={styles.filters} aria-label="雪场筛选">
        <ControlHint hint="选填，按雪场发布状态筛选；清空表示全部状态。">
          <Select
            aria-label="审核状态"
            allowClear
            value={status}
            placeholder="全部审核状态"
            style={{ width: 180 }}
            options={Object.entries(resortStatuses).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
        </ControlHint>
        <Button disabled={loading} onClick={() => void reload()}>
          刷新
        </Button>
        {result ? <span>{result.total} 个雪场</span> : null}
      </section>
      {error ? (
        <section className={styles.error} role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button onClick={() => void reload()}>重试</Button>
        </section>
      ) : null}
      {result?.items.length === 0 && page > 1 ? (
        <Button onClick={() => setPage(1)}>当前页暂无雪场，返回第一页</Button>
      ) : null}
      <Table<MerchantResort>
        rowKey="resortId"
        dataSource={result?.items ?? []}
        loading={loading}
        scroll={{ x: 900 }}
        locale={{ emptyText: loading ? "正在读取" : "暂无雪场资料" }}
        columns={[
          {
            title: "雪场",
            render: (_, item) => (
              <div className={styles.identity}>
                <strong>{item.name}</strong>
                <span>
                  {[item.province, item.city, item.district]
                    .filter(Boolean)
                    .join(" / ") || "地区未填写"}
                </span>
              </div>
            ),
          },
          {
            title: "审核状态",
            dataIndex: "status",
            render: (value) =>
              resortStatuses[value as keyof typeof resortStatuses] ?? value,
          },
          {
            title: "营业状态",
            dataIndex: "openStatus",
            render: (value) =>
              ({
                open: "营业中",
                closed: "暂停营业",
                limited: "部分开放",
                unknown: "未更新",
              })[value as "open"] ?? value,
          },
          {
            title: "起步票价",
            dataIndex: "price",
            render: (value) => `¥${value}`,
          },
          {
            title: "更新时间",
            dataIndex: "updatedAt",
            render: (value) => new Date(value).toLocaleString("zh-CN"),
          },
          {
            title: "操作",
            render: (_, item) => (
              <Space wrap>
                {canUseResorts(operator, "update") ? (
                  <Link href={merchantResortEditRoute(item.resortId)}>
                    编辑
                  </Link>
                ) : null}
                {canUseResorts(operator, "delete") ? (
                  <Popconfirm
                    title="停用这条雪场资料？"
                    description="资料将不再公开。确认后会重新读取最新资料。"
                    disabled={writes.saving || writes.pending || loading}
                    onConfirm={() => void archive(item)}
                  >
                    <Button
                      danger
                      disabled={writes.saving || writes.pending || loading}
                    >
                      停用
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
        pagination={{
          current: page,
          pageSize: 20,
          total: result?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />
    </main>
  );
}
