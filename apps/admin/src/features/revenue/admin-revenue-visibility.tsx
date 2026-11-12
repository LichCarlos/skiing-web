"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "antd";
import { RequestLane } from "@/platform/api/request-lane";
import { apiRequest } from "@/platform/api";
import {
  canUseAdminRevenue,
  checkRevenueActor,
} from "@/features/revenue/admin-revenue-workflow";
import type { RevenueOperator } from "@/features/revenue/merchant-revenue-model";

/** Hiding discards page state; durable request records live outside this subtree. */
export function AdminRevenueVisibility({
  actor,
  children,
}: {
  actor: RevenueOperator;
  children: (signal: AbortSignal) => ReactNode;
}) {
  const [lifetime] = useState(() => ({
    controller: undefined as AbortController | undefined,
    mounted: false,
    resuming: false,
  }));
  const [signal, setSignal] = useState<AbortSignal>();
  const [lane] = useState(() => new RequestLane());
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    lifetime.mounted = true;
    const pause = () => {
      lane.cancel();
      lifetime.controller?.abort();
      setSignal(undefined);
      setError(undefined);
      setLoading(false);
      lifetime.resuming = false;
    };
    const hide = () => {
      if (document.visibilityState !== "visible") pause();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pause);
    if (document.visibilityState === "visible") {
      lifetime.controller = new AbortController();
      setSignal(lifetime.controller.signal);
    }
    return () => {
      lifetime.mounted = false;
      lifetime.controller?.abort();
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pause);
    };
  }, [lane, lifetime]);
  async function resume() {
    if (
      !lifetime.mounted ||
      document.visibilityState !== "visible" ||
      lifetime.resuming
    )
      return;
    lifetime.resuming = true;
    setLoading(true);
    setError(undefined);
    await lane.run(
      async (signal) => {
        await checkRevenueActor(
          apiRequest,
          actor,
          canUseAdminRevenue(actor, "list") ? "list" : "upsert",
          signal,
        );
        signal.throwIfAborted();
      },
      () => {
        if (document.visibilityState !== "visible") return;
        lifetime.controller = new AbortController();
        setSignal(lifetime.controller.signal);
      },
      () => setError("身份核对失败，请重新读取登录身份后再恢复"),
      () => {
        lifetime.resuming = false;
        setLoading(false);
      },
    );
  }
  if (signal && !signal.aborted) return children(signal);
  return (
    <section role="status">
      <h1>收益维护</h1>
      <AdminParagraph>
        页面读取已暂停，恢复后将重新读取收益与本机原请求记录
      </AdminParagraph>
      {error ? <AdminParagraph role="alert">{error}</AdminParagraph> : null}
      <Button loading={loading} onClick={() => void resume()}>
        核对身份并恢复页面
      </Button>
    </section>
  );
}
