"use client";
import { useEffect, useState } from "react";
import {
  MemberError,
  MemberRun,
  memberFailure,
} from "@/features/member/member-model";
import styles from "@/features/member/member.module.css";

export function ResortPicker({
  run,
  enabled,
  value,
  initialName,
  disabled,
  onChange,
}: {
  run: MemberRun;
  enabled: boolean;
  value: string;
  initialName?: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "20",
        sortBy: "name",
        sortOrder: "asc",
      });
      if (keyword.trim()) query.set("keyword", keyword.trim());
      void run
        .read(`/resorts?${query}`, (value) => {
          const page = value as {
            items?: { resortId?: unknown; name?: unknown }[];
          };
          if (!Array.isArray(page?.items) || page.items.length > 20)
            throw new MemberError("雪场列表无法读取。");
          return page.items.map((item) => {
            if (
              !Number.isSafeInteger(item.resortId) ||
              Number(item.resortId) < 1 ||
              typeof item.name !== "string"
            )
              throw new MemberError("雪场列表无法读取。");
            return { id: Number(item.resortId), name: item.name };
          });
        })
        .then((rows) => {
          if (current) setOptions(rows);
        })
        .catch((cause) => {
          if (current && cause?.name !== "AbortError")
            setError(memberFailure(cause));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [run, enabled, keyword, retry]);
  return (
    <fieldset className={styles.resortLabel} disabled={disabled}>
      <legend>关联雪场（可选）</legend>
      <div className={styles.resortControl}>
        <label>
          搜索雪场名称
          <input
            type="search"
            maxLength={100}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="输入雪场名称"
          />
        </label>
        <label>
          选择雪场
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">不关联雪场</option>
            {value &&
              !options.some((option) => String(option.id) === value) && (
                <option value={value}>{initialName || "已选择的雪场"}</option>
              )}
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <span role="status">正在查找雪场…</span>
      ) : error ? (
        <span role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((x) => x + 1)}>
            重新查找
          </button>
        </span>
      ) : !options.length ? (
        <span>没有找到匹配雪场，试试其他名称。</span>
      ) : (
        <span>可搜索并选择公开雪场，也可以不关联。</span>
      )}
    </fieldset>
  );
}
