"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/platform/api";
import { routes } from "@/config/routes";
import {
  entities,
  operations,
  operators,
  makeQuery,
  parseCatalogFields,
  parseCatalogPage,
  type Entity,
  type Filter,
  type QueryField,
  type QueryPage,
} from "@/features/catalog/catalog-model";
import styles from "@/features/catalog/public-catalog.module.css";
export function PublicCatalog() {
  const [entity, setEntity] = useState<Entity>("ski_resort");
  return (
    <section>
      <label>
        数据类型{" "}
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value as Entity)}
        >
          {Object.entries(entities).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <CatalogWorkspace key={entity} entity={entity} />
    </section>
  );
}
function CatalogWorkspace({ entity }: { entity: Entity }) {
  const [fields, setFields] = useState<QueryField[] | null>(null),
    [filters, setFilters] = useState<Filter[]>([]),
    [keyword, setKeyword] = useState(""),
    [sort, setSort] = useState(""),
    [direction, setDirection] = useState<"asc" | "desc">("asc"),
    [result, setResult] = useState<QueryPage | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null),
    alive = useRef(false),
    query = useRef<ReturnType<typeof makeQuery> | null>(null);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    active.current = controller;
    void apiRequest<unknown>(`/catalog/${entity}/fields`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((value) => {
        controller.signal.throwIfAborted();
        setFields(parseCatalogFields(value));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("字段目录读取失败，请重新打开本页重试。");
      });
    const hide = () => {
      if (document.visibilityState !== "visible") {
        active.current?.abort();
        setResult(null);
        setBusy(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      alive.current = false;
      active.current?.abort();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [entity]);
  async function search(page = 1) {
    if (!fields || busy || document.visibilityState !== "visible") return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const body =
        page === 1
          ? {
              ...makeQuery(fields, filters, page, sort, direction),
              ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
            }
          : { ...query.current!, page };
      setBusy(true);
      setError("");
      setResult(null);
      const value = await apiRequest<unknown>(`/catalog/${entity}/query`, {
        method: "POST",
        body,
        signal: controller.signal,
        cache: "no-store",
      });
      controller.signal.throwIfAborted();
      query.current = body;
      setResult(parseCatalogPage(value, page));
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "查询失败，请重试。");
    } finally {
      if (alive.current && active.current === controller) setBusy(false);
    }
  }
  const update = (index: number, patch: Partial<Filter>) => {
    setFilters((current) =>
      current.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
    setResult(null);
  };
  return (
    <div className={styles.workspace}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <fieldset disabled={!fields || busy}>
          <legend>筛选条件（同时满足）</legend>
          <label>
            搜索关键词
            <input
              value={keyword}
              maxLength={200}
              onChange={(e) => {
                setKeyword(e.target.value);
                setResult(null);
              }}
            />
          </label>
          {filters.map((filter, index) => {
            const field = fields?.find((f) => f.key === filter.field);
            return (
              <div key={index} className={styles.filter}>
                <label>
                  字段
                  <select
                    aria-label={`条件${index + 1}字段`}
                    value={filter.field}
                    onChange={(e) => {
                      const next = fields!.find(
                        (f) => f.key === e.target.value,
                      )!;
                      update(index, {
                        field: next.key,
                        op: operators(next)[0]!,
                        text: "",
                      });
                    }}
                  >
                    {fields
                      ?.filter((f) => f.filterable)
                      .map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  关系
                  <select
                    value={filter.op}
                    onChange={(e) =>
                      update(index, { op: e.target.value as Filter["op"] })
                    }
                  >
                    {field
                      ? operators(field).map((op) => (
                          <option key={op} value={op}>
                            {operations[op]}
                          </option>
                        ))
                      : null}
                  </select>
                </label>
                <label>
                  值
                  {field?.dataType === "boolean" ||
                  ["single_select", "multi_select"].includes(
                    field?.dataType ?? "",
                  ) ? (
                    <select
                      value={filter.text}
                      onChange={(e) => update(index, { text: e.target.value })}
                    >
                      <option value="">请选择</option>
                      {field?.dataType === "boolean" ? (
                        <>
                          <option value="true">是</option>
                          <option value="false">否</option>
                        </>
                      ) : (
                        field?.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))
                      )}
                    </select>
                  ) : (
                    <input
                      value={filter.text}
                      maxLength={200}
                      type={
                        field?.dataType === "date"
                          ? "date"
                          : ["integer", "decimal"].includes(
                                field?.dataType ?? "",
                              )
                            ? "number"
                            : "text"
                      }
                      step="any"
                      onChange={(e) => update(index, { text: e.target.value })}
                    />
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setFilters((current) =>
                      current.filter((_, i) => i !== index),
                    );
                    setResult(null);
                  }}
                >
                  移除条件
                </button>
              </div>
            );
          })}
          <button
            type="button"
            disabled={filters.length >= 8 || !fields?.some((f) => f.filterable)}
            onClick={() => {
              const f = fields!.find((f) => f.filterable)!;
              setFilters((current) => [
                ...current,
                { field: f.key, op: operators(f)[0]!, text: "" },
              ]);
              setResult(null);
            }}
          >
            添加条件
          </button>
          <label>
            排序
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setResult(null);
              }}
            >
              <option value="">默认顺序</option>
              {fields
                ?.filter((f) => f.sortable && f.dataType !== "multi_select")
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            方向
            <select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as "asc" | "desc");
                setResult(null);
              }}
            >
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
          </label>
          <button type="submit">{busy ? "查询中…" : "查询公开数据"}</button>
        </fieldset>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <section aria-live="polite">
          <p>
            共 {result.total} 条 · 查询时间{" "}
            {new Date(result.asOf).toLocaleString()}
          </p>
          {result.items.length ? (
            result.items.map((row) => (
              <article className={styles.result} key={row.id}>
                <h2>
                  <Link
                    href={
                      entity === "ski_resort"
                        ? routes.resortDetail(row.id)
                        : entity === "article"
                          ? routes.articleDetail(row.id)
                          : routes.dynamicDetail(row.id)
                    }
                  >
                    {row.title}
                  </Link>
                </h2>
                <dl>
                  {fields?.flatMap((f) => {
                    const value = f.key.startsWith("custom.")
                      ? row.customFields[f.key.slice(7)]
                      : row.fields[f.key];
                    return value === undefined || value === null
                      ? []
                      : [
                          <div key={f.key}>
                            <dt>{f.label}</dt>
                            <dd>
                              {Array.isArray(value)
                                ? value.map(String).join("、")
                                : typeof value === "boolean"
                                  ? value
                                    ? "是"
                                    : "否"
                                  : String(value)}
                            </dd>
                          </div>,
                        ];
                  })}
                </dl>
              </article>
            ))
          ) : (
            <p>没有符合条件的数据，试试减少筛选条件。</p>
          )}
          <button
            disabled={busy || result.page <= 1}
            onClick={() => void search(result.page - 1)}
          >
            上一页
          </button>
          <span> 第 {result.page} 页 </span>
          <button
            disabled={busy || result.page * result.pageSize >= result.total}
            onClick={() => void search(result.page + 1)}
          >
            下一页
          </button>
        </section>
      ) : null}
    </div>
  );
}
