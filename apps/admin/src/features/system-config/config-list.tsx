"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Space, Table } from "antd";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import {
  configQuery,
  configError,
  type ConfigPage,
  type ConfigItem,
} from "@/features/system-config/config-api";
import {
  canManageConfig,
  type ConfigOperator,
} from "@/features/system-config/config-model";
import { readConfigPage } from "@/features/system-config/config-queries";
import {
  ConfigSession,
  ConfigWriteRecovery,
  useConfigWrites,
} from "@/features/system-config/config-session";
import { ConfigEditor } from "@/features/system-config/config-editor";
export function ConfigList() {
  return (
    <ConfigSession target="catalog">
      {(operator) => <Catalog operator={operator} />}
    </ConfigSession>
  );
}
function Catalog({ operator }: { operator: ConfigOperator }) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState({ keyword: "", page: 1, pageSize: 20 });
  const [data, setData] = useState<ConfigPage>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>();
  const [lane] = useState(() => new RequestLane());
  const writes = useConfigWrites(operator);
  const [dataKey, setDataKey] = useState<string>();
  const queryKey = JSON.stringify(query);
  const generation = useRef(0);
  const renderedGeneration = generation.current;
  const reload = useCallback(async () => {
    if (document.visibilityState !== "visible") return false;
    writes.gate.activate();
    setLoading(true);
    setData(undefined);
    setError(undefined);
    return lane.run(
      (signal) => readConfigPage(apiRequest, operator, query, signal),
      (value) => {
        setData(value);
        setDataKey(queryKey);
      },
      (cause) => setError(configError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, query, writes.gate, queryKey]);
  useEffect(() => {
    const clear = () => {
      generation.current++;
      lane.cancel();
      setData(undefined);
      setDataKey(undefined);
      setSelected(undefined);
      setSearch("");
      setLoading(false);
      setError("页面读取已暂停，请刷新后继续");
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    hide();
    return () => {
      generation.current++;
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [lane]);
  useEffect(() => {
    void reload();
    return () => lane.cancel();
  }, [reload, lane]);
  function applySearch(keyword: string) {
    try {
      configQuery(keyword, 1, query.pageSize);
      setQuery({ ...query, keyword: keyword.trim(), page: 1 });
    } catch (cause) {
      setError(configError(cause));
    }
  }
  return (
    <section>
      <h1>系统配置</h1>
      <AdminParagraph>
        维护平台品牌、联系信息和政策正文；保存后供官网与 App 展示。
      </AdminParagraph>
      <ConfigWriteRecovery
        operator={operator}
        writes={writes}
        reload={reload}
      />
      <Space wrap>
        <ControlHint hint="选填，按平台配置名称或标识筛选。">
          <Input
            aria-label="搜索配置名称或键"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            placeholder="配置名称或键"
            onPressEnter={() => applySearch(search)}
          />
        </ControlHint>
        <Button onClick={() => applySearch(search)}>查询</Button>
        <Button
          onClick={() => {
            setSearch("");
            applySearch("");
          }}
        >
          清空
        </Button>
        <Button onClick={() => void reload()}>刷新</Button>
      </Space>
      {error ? (
        <Alert
          type="error"
          title={error}
          action={<Button onClick={() => void reload()}>重试</Button>}
        />
      ) : null}
      {dataKey === queryKey && data?.items.length === 0 && query.page > 1 ? (
        <Button onClick={() => setQuery({ ...query, page: 1 })}>
          当前页暂无配置，返回第一页
        </Button>
      ) : null}
      <Table<ConfigItem>
        rowKey="configKey"
        loading={loading}
        dataSource={dataKey === queryKey ? (data?.items ?? []) : []}
        locale={{ emptyText: loading ? "正在读取" : "暂无匹配配置" }}
        scroll={{ x: 800 }}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total: dataKey === queryKey ? (data?.total ?? 0) : 0,
          showSizeChanger: true,
          onChange: (page, pageSize) =>
            setQuery({
              ...query,
              page: query.pageSize !== pageSize ? 1 : page,
              pageSize,
            }),
        }}
        columns={[
          { title: "名称", dataIndex: "label" },
          { title: "配置键", dataIndex: "configKey" },
          {
            title: "当前内容",
            render: (_, item) =>
              item.value ? [...item.value].slice(0, 100).join("") : "尚未配置",
            width: 320,
          },
          { title: "版本", dataIndex: "version" },
          {
            title: "更新时间",
            render: (_, item) =>
              item.updatedAt
                ? new Date(item.updatedAt).toLocaleString("zh-CN")
                : "默认值",
          },
          {
            title: "操作",
            render: (_, item) => (
              <Button
                disabled={writes.saving}
                onClick={() => {
                  if (
                    generation.current === renderedGeneration &&
                    document.visibilityState === "visible" &&
                    writes.gate.isActive() &&
                    !writes.gate.isBusy()
                  )
                    setSelected(item.configKey);
                }}
              >
                {canManageConfig(operator, true) && !writes.pending
                  ? "编辑"
                  : "查看 / 核对"}
              </Button>
            ),
          },
        ]}
      />
      {selected ? (
        <ConfigEditor
          key={selected}
          operator={operator}
          configKey={selected}
          writes={writes}
          close={() => setSelected(undefined)}
          saved={() => void reload()}
        />
      ) : null}
    </section>
  );
}
