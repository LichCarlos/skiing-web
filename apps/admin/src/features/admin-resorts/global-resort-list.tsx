"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { adminResortEditRoute, routes } from "@/config/routes";
import { apiRequest } from "@/platform/api";
import { getPageHref } from "@/platform/config";
import { RequestLane } from "@/platform/api/request-lane";
import { resortError } from "@/features/merchant-resorts/resort-model";
import {
  GlobalResortSession,
  GlobalResortRecovery,
  useGlobalResortWrites,
} from "@/features/admin-resorts/global-resort-session";
import {
  readGlobalResortPage,
  prepareGlobalCommand,
  runGlobalCommand,
} from "@/features/admin-resorts/global-resort-api";
import {
  canManageGlobalResorts,
  mayRunGlobalCommand,
  resortStatuses,
  type GlobalResort,
  type GlobalResortPage,
  type GlobalResortOperator,
  type GlobalResortFilters,
} from "@/features/admin-resorts/global-resort-model";
import styles from "@/app/admin/merchant/resorts/page.module.css";
type Command = "publish" | "offline" | "delete";
const commandLabels: Record<Command, string> = {
  publish: "发布",
  offline: "下架",
  delete: "删除",
};
export function GlobalResortActions({
  item,
  operator,
  disabled,
  onCommand,
}: {
  item: GlobalResort;
  operator: GlobalResortOperator;
  disabled: boolean;
  onCommand: (item: GlobalResort, command: Command, reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Space wrap>
      {canManageGlobalResorts(operator, "update") ? (
        <Button
          disabled={disabled}
          type="link"
          href={getPageHref(adminResortEditRoute(item.resortId))}
        >
          编辑
        </Button>
      ) : null}
      {(["publish", "offline", "delete"] as const).map((command) =>
        canManageGlobalResorts(operator, command) &&
        mayRunGlobalCommand(item, command) ? (
          <Popconfirm
            key={command}
            title={`确认${commandLabels[command]}「${item.name}」？`}
            description={
              command === "delete" ? (
                "仅软删除资料，保留审计与历史收益。"
              ) : (
                <label>
                  操作原因（可选，1–500字）
                  <ControlHint
                    hint="选填，填写后需为1–500字，不能仅含空白；将记录操作审计。"
                    fluid
                  >
                    <Input.TextArea
                      aria-label="发布下架原因"
                      value={reason}
                      maxLength={500}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </ControlHint>
                  {reason && !reason.trim() ? (
                    <span role="alert">原因不能仅包含空白</span>
                  ) : null}
                </label>
              )
            }
            disabled={disabled}
            okButtonProps={{
              disabled: disabled || Boolean(reason && !reason.trim()),
            }}
            onOpenChange={() => setReason("")}
            onConfirm={() => {
              const text = reason.trim();
              if (reason && !text) return;
              return text
                ? onCommand(item, command, text)
                : onCommand(item, command);
            }}
          >
            <Button
              type="link"
              danger={command !== "publish"}
              disabled={disabled}
            >
              {commandLabels[command]}
            </Button>
          </Popconfirm>
        ) : null,
      )}
    </Space>
  );
}
export function GlobalResortList() {
  return (
    <GlobalResortSession target="list">
      {(operator) => <Inventory operator={operator} />}
    </GlobalResortSession>
  );
}
function Inventory({ operator }: { operator: GlobalResortOperator }) {
  const { message } = App.useApp();
  const [filters, setFilters] = useState<GlobalResortFilters>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>();
  const key = JSON.stringify(filters);
  const context = useRef(key);
  context.current = key;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    loading: boolean;
    data?: GlobalResortPage;
    error?: string;
  }>({ key, loading: true });
  const view = snapshot.key === key ? snapshot : { key, loading: true };
  const [lane] = useState(() => new RequestLane());
  const writes = useGlobalResortWrites(operator);
  const locked = writes.saving || writes.pending;
  const reload = useCallback(async () => {
    if (document.visibilityState !== "visible" || context.current !== key)
      return false;
    writes.gate.activate();
    setSnapshot({ key, loading: true });
    return lane.run(
      (signal) => readGlobalResortPage(apiRequest, operator, filters, signal),
      (data) => setSnapshot({ key, loading: false, data }),
      (cause) =>
        setSnapshot({ key, loading: false, error: resortError(cause) }),
      () => {},
    );
  }, [lane, operator, filters, key, writes.gate]);
  useEffect(() => {
    void reload();
    return () => lane.cancel();
  }, [reload, lane]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setSnapshot({
        key: context.current,
        loading: false,
        error: "页面读取已暂停，请点击刷新重新读取雪场",
      });
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
  async function command(item: GlobalResort, action: Command, reason?: string) {
    if (
      view.loading ||
      !view.data ||
      context.current !== key ||
      document.visibilityState !== "visible"
    )
      return;
    await writes.run(
      { action, resortId: item.resortId },
      (signal) =>
        prepareGlobalCommand(apiRequest, operator, item, action, signal),
      (current, signal) =>
        runGlobalCommand(apiRequest, current.resortId, action, signal, reason),
      () => {
        message.success(`雪场已${commandLabels[action]}`);
        void reload();
      },
    );
  }
  function search() {
    if (!locked) setFilters({ page: 1, keyword, merchantId, status });
  }
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>全局雪场</h1>
          <AdminParagraph>
            维护平台和商家雪场资料，审核发布状态及归属。
          </AdminParagraph>
        </div>
        {canManageGlobalResorts(operator, "create") ? (
          <Button disabled={locked} href={getPageHref(routes.newAdminResort)}>
            新建全局雪场
          </Button>
        ) : null}
      </header>
      <GlobalResortRecovery
        operator={operator}
        writes={writes}
        reload={reload}
      />
      <section className={styles.filters} aria-label="全局雪场筛选">
        <ControlHint hint="选填，按雪场名称或省市关键词查询，最多100字。">
          <Input
            aria-label="雪场关键词"
            value={keyword}
            maxLength={100}
            disabled={locked}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={search}
            placeholder="搜索雪场、省市"
          />
        </ControlHint>
        <ControlHint hint="选填，填写1至2147483647的商家ID，留空表示全部授权范围。">
          <InputNumber
            aria-label="商家编号"
            value={merchantId}
            min={1}
            max={2147483647}
            precision={0}
            disabled={locked}
            onChange={(value) => setMerchantId(value)}
            placeholder="商家 ID"
          />
        </ControlHint>
        <ControlHint hint="选填，按雪场发布状态筛选；清空表示全部状态。">
          <Select
            aria-label="生命周期"
            allowClear
            value={status}
            disabled={locked}
            onChange={setStatus}
            placeholder="全部状态"
            options={Object.entries(resortStatuses).map(([value, label]) => ({
              value,
              label,
            }))}
            style={{ minWidth: 150 }}
          />
        </ControlHint>
        <Button onClick={search} disabled={locked}>
          查询
        </Button>
        <Button disabled={locked || view.loading} onClick={() => void reload()}>
          刷新
        </Button>
      </section>
      {view.error ? (
        <section role="alert">
          <AdminParagraph>{view.error}</AdminParagraph>
          <Button onClick={() => void reload()}>重试</Button>
        </section>
      ) : null}
      {view.data?.items.length === 0 && filters.page > 1 ? (
        <Button onClick={() => setFilters({ ...filters, page: 1 })}>
          当前页暂无雪场，返回第一页
        </Button>
      ) : null}
      <Table<GlobalResort>
        rowKey="resortId"
        loading={view.loading}
        dataSource={view.data?.items ?? []}
        pagination={{
          current: filters.page,
          pageSize: 20,
          total: view.data?.total ?? 0,
          showSizeChanger: false,
          disabled: locked,
          onChange: (page) => setFilters({ ...filters, page }),
        }}
        columns={[
          {
            title: "雪场",
            key: "name",
            render: (_, item) => (
              <div>
                <strong>
                  #{item.resortId} {item.name}
                </strong>
                <AdminParagraph>
                  {[item.province, item.city, item.district]
                    .filter(Boolean)
                    .join(" / ") || "地区未填写"}
                </AdminParagraph>
              </div>
            ),
          },
          {
            title: "商家归属",
            key: "merchant",
            render: (_, item) =>
              item.merchantId === null
                ? "平台资料"
                : `#${item.merchantId} ${item.merchantName ?? "未填写名称"}`,
          },
          {
            title: "状态",
            key: "status",
            render: (_, item) => (
              <Tag color={item.status === "published" ? "green" : "default"}>
                {resortStatuses[item.status as keyof typeof resortStatuses]}
              </Tag>
            ),
          },
          {
            title: "票价 / 评分",
            key: "rating",
            render: (_, item) =>
              `¥${item.price} / ${item.rating ?? "未评分"}（${item.ratingCount}人）`,
          },
          {
            title: "更新时间",
            dataIndex: "updatedAt",
            key: "updatedAt",
            render: (value: string) => new Date(value).toLocaleString("zh-CN"),
          },
          {
            title: "操作",
            key: "actions",
            render: (_, item) => (
              <GlobalResortActions
                item={item}
                operator={operator}
                disabled={locked || view.loading}
                onCommand={(row, action) => void command(row, action)}
              />
            ),
          },
        ]}
      />
    </main>
  );
}
