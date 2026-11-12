"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { SnowMark } from "@/components/snow-mark";
import { BrandGridFooter } from "@/components/brand-grid-footer";
import { usePathname } from "next/navigation";
import {
  readSiteConfig,
  type SiteConfig,
} from "@/features/site-config/site-config-api";
import {
  SiteConfigRun,
  initialConfigState,
  visibleConfig,
  type ConfigState,
} from "@/features/site-config/site-config-run";
import { routes } from "@/config/routes";
import { SectionHold } from "@/features/home/section-hold";
import styles from "@/features/site-config/site-config.module.css";

export type { SiteConfig } from "@/features/site-config/site-config-api";
type State = {
  data: SiteConfig | null;
  loading: boolean;
  error: boolean;
  reload(): void;
};
const Context = createContext<State>({
  data: null,
  loading: true,
  error: false,
  reload() {},
});
export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  currentPath.current = pathname;
  const [state, setState] = useState<ConfigState>(initialConfigState);
  const [run] = useState(
    () =>
      new SiteConfigRun({
        pathname: () => currentPath.current,
        read: readSiteConfig,
        changed: setState,
      }),
  );
  useEffect(() => run.activate(pathname), [pathname, run]);
  const visible = visibleConfig(state, pathname);
  return (
    <Context.Provider value={{ ...visible, reload: run.retry(pathname) }}>
      {children}
      <SiteFooter />
    </Context.Provider>
  );
}
export function SiteName() {
  return <>{useContext(Context).data?.siteName ?? "凛迹雪客"}</>;
}
export function SiteTagline() {
  return <>{useContext(Context).data?.tagline ?? "滑雪社群综合服务平台"}</>;
}
function SiteFooter() {
  const state = useContext(Context);
  const pathname = usePathname();
  if (pathname === routes.login) return null;
  return (
    <footer className={styles.footer}>
      <SectionHold>
        <BrandGridFooter>
          <nav aria-label="平台信息">
            <Link href={routes.about}>关于平台</Link>
            <Link href={routes.privacy}>隐私政策</Link>
            <Link href={routes.terms}>用户协议</Link>
          </nav>
          {state.error && (
            <span role="status">
              平台信息暂时无法加载 <button onClick={state.reload}>重试</button>
            </span>
          )}
        </BrandGridFooter>
      </SectionHold>
    </footer>
  );
}
export type PolicyKind = "about" | "privacyPolicy" | "termsOfService";
export function PolicyBody({
  data,
  kind,
}: {
  data: SiteConfig;
  kind: PolicyKind;
}) {
  const content = data[kind];
  return (
    <>
      <p>
        {data.siteName} · {data.tagline}
      </p>
      <div className={styles.body}>
        {content ??
          (kind === "about" ? "平台介绍尚未配置。" : "尚未发布正式内容。")}
      </div>
      {kind === "about" && (
        <p>
          联系邮箱：
          {data.contactEmail ? (
            <a href={`mailto:${encodeURIComponent(data.contactEmail)}`}>
              {data.contactEmail}
            </a>
          ) : (
            "尚未配置"
          )}
        </p>
      )}
    </>
  );
}
export function PolicyPage({
  kind,
  title,
}: {
  kind: PolicyKind;
  title: string;
}) {
  const state = useContext(Context);
  return (
    <main className={styles.page}>
      <Link href={routes.home}>返回首页</Link>
      <h1 className={styles.policyTitle}>
        {kind === "about" && (
          <span className={styles.policyIcon}>
            <SnowMark />
          </span>
        )}
        {title}
      </h1>
      {state.loading ? (
        <p role="status">正在加载平台信息…</p>
      ) : state.error || !state.data ? (
        <div role="alert">
          <p>内容暂时无法加载。</p>
          <button onClick={state.reload}>重试</button>
        </div>
      ) : (
        <PolicyBody data={state.data} kind={kind} />
      )}
    </main>
  );
}
