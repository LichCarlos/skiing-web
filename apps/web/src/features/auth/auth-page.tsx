"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { routes } from "@/config/routes";
import { SnowMark } from "@/components/snow-mark";
import { ArrowIcon } from "@/components/site-symbol";
import { BrandGridFooter } from "@/components/brand-grid-footer";
import { SiteName } from "@/features/site-config/site-config";
import { usePublicSession } from "@/platform/auth/public-session";
import { apiRequest } from "@/platform/api";
import { type AuthMode } from "@/features/auth/auth-model";
import {
  RegistrationRun,
  initialRegistration,
} from "@/features/auth/registration-run";
import { AuthBackground } from "@/features/auth/auth-background";
import skiPhoto from "@/features/auth/assets/ski-chamonix.jpg";
import styles from "@/features/auth/auth-page.module.css";

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!visible && <path d="m3 3 18 18" />}
    </svg>
  );
}

export function AuthPage({
  initialMode = "login",
  returnTo = routes.home,
}: {
  initialMode?: AuthMode;
  returnTo?: Route;
}) {
  const router = useRouter();
  const session = usePublicSession();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [paused, setPaused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(
    null,
  );
  const [registration, setRegistration] = useState(initialRegistration);
  const [notice, setNotice] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const redirected = useRef(false);
  const modeChanged = useRef(false);
  const [run] = useState(
    () =>
      new RegistrationRun({
        request: apiRequest,
        changed: setRegistration,
        registered: (registeredAccount) => {
          setAccount(registeredAccount);
          setMode("login");
          setPasswordVisible(false);
          setConfirmationError(null);
          setNotice("账号已创建，请使用刚才设置的密码登录。");
          modeChanged.current = true;
        },
      }),
  );
  useEffect(() => {
    run.activate();
    return () => run.deactivate();
  }, [run]);
  useEffect(() => {
    if (session.ready && session.user && !redirected.current) {
      redirected.current = true;
      router.replace(returnTo);
    }
  }, [session.ready, session.user, router, returnTo]);
  useEffect(() => {
    if (modeChanged.current) {
      heading.current?.focus({ preventScroll: true });
      modeChanged.current = false;
    }
  }, [mode]);
  const busy = session.busy || registration.busy;
  const blocked =
    busy || session.reading || session.uncertain || !session.ready;
  const error =
    confirmationError ??
    registration.error ??
    (mode === "login" || session.uncertain ? session.error : null);

  function changeMode(next: AuthMode) {
    if (busy || mode === next) return;
    form.current?.reset();
    setPasswordVisible(false);
    setConfirmationError(null);
    setNotice(null);
    run.clear();
    modeChanged.current = true;
    setMode(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const values = new FormData(event.currentTarget);
    const password = values.get("password");
    if (mode === "register" && password !== values.get("confirmPassword")) {
      setConfirmationError("两次输入的密码不一致，请重新确认。");
      const confirmation =
        event.currentTarget.elements.namedItem("confirmPassword");
      if (confirmation instanceof HTMLInputElement) confirmation.focus();
      return;
    }
    setConfirmationError(null);
    const field = event.currentTarget.elements.namedItem("password");
    if (field instanceof HTMLInputElement) field.value = "";
    const confirmation =
      event.currentTarget.elements.namedItem("confirmPassword");
    if (confirmation instanceof HTMLInputElement) confirmation.value = "";
    setPasswordVisible(false);
    setNotice(null);
    if (mode === "login") void session.login(values.get("account"), password);
    else
      void run.submit(values.get("account"), password, values.get("nickname"));
  }
  return (
    <div className={styles.page} data-auth-page>
      <AuthBackground paused={paused} />
      <a href="#auth-form" className={styles.skip}>
        跳至账号表单
      </a>
      <header className={styles.header}>
        <Link
          href={routes.home}
          className={styles.brand}
          aria-label="凛迹雪客首页"
        >
          <SnowMark />
          <SiteName />
        </Link>
        <Link href={routes.home} className={styles.back}>
          <ArrowIcon direction="left" /> 返回首页
        </Link>
      </header>
      <main className={styles.main}>
        <div className={styles.card} data-mode={mode}>
          <div className={styles.photoSlot}>
            <section className={styles.photo} aria-label="滑雪实景">
              <picture>
                <source media="(min-width: 850px)" srcSet={skiPhoto.src} />
                <img
                  src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
                  width={1440}
                  height={1080}
                  alt="滑雪者在霞慕尼勃朗峰地区的粉雪坡面转弯，身后留下连续雪痕"
                />
              </picture>
              <div className={styles.photoCopy}>
                <SnowMark className={styles.photoMark} />
                <h2>
                  {mode === "login" ? (
                    <>
                      把日常
                      <br />
                      留在山下。
                    </>
                  ) : (
                    <>
                      新的雪季，
                      <br />
                      一起出发。
                    </>
                  )}
                </h2>
                <p>找到下一座雪山，也找到同频的雪友。</p>
              </div>
              <div className={styles.photoBottom}>
                <span>在雪上，留下自己的轨迹。</span>
                <a
                  href="https://commons.wikimedia.org/wiki/File:Powder_skiing_in_Chamonix_Mont_Blanc.JPG"
                  target="_blank"
                  rel="noreferrer"
                >
                  摄影 Webwizzard · CC BY-SA 4.0
                </a>
                <span>霞慕尼实景 · 非本平台雪场展示</span>
              </div>
            </section>
          </div>
          <section
            className={styles.formPanel}
            id="auth-form"
            aria-labelledby="auth-title"
          >
            <div className={styles.formContent} key={mode}>
              <h1 ref={heading} tabIndex={-1} id="auth-title">
                {mode === "login"
                  ? "欢迎归队，雪友。"
                  : "你的雪季，从这里开始。"}
              </h1>
              <p className={styles.intro}>
                {mode === "login"
                  ? "登录账号，把想去的雪场与喜欢的知识留在身边。"
                  : "创建普通用户账号，收藏知识，加入雪友社区。"}
              </p>
              {notice && (
                <p className={styles.success} role="status">
                  {notice}
                </p>
              )}
              {error && (
                <p className={styles.error} role="alert" id="auth-error">
                  {error}
                </p>
              )}
              <form
                ref={form}
                key={mode}
                onSubmit={submit}
                aria-busy={busy}
                aria-describedby={error ? "auth-error" : undefined}
              >
                <label className={styles.field}>
                  账号
                  <input
                    name="account"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={50}
                    required
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    placeholder="输入你的账号"
                    disabled={blocked}
                  />
                </label>
                {mode === "register" && (
                  <label className={styles.field}>
                    昵称
                    <input
                      name="nickname"
                      autoComplete="nickname"
                      maxLength={50}
                      required
                      placeholder="雪友怎么称呼你"
                      disabled={blocked}
                    />
                  </label>
                )}
                <label className={styles.field}>
                  密码
                  <span className={styles.password}>
                    <input
                      name="password"
                      aria-label="密码"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      required
                      maxLength={72}
                      placeholder={
                        mode === "login" ? "输入你的密码" : "8–72 个 UTF-8 字节"
                      }
                      disabled={blocked}
                      onChange={() => setConfirmationError(null)}
                      aria-describedby={
                        mode === "register" ? "password-help" : undefined
                      }
                    />
                    <button
                      type="button"
                      className={styles.eye}
                      disabled={blocked}
                      aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                      aria-pressed={passwordVisible}
                      onClick={() => setPasswordVisible((value) => !value)}
                    >
                      <EyeIcon visible={passwordVisible} />
                    </button>
                  </span>
                </label>
                {mode === "register" && (
                  <label className={styles.field}>
                    确认密码
                    <input
                      name="confirmPassword"
                      aria-label="确认密码"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      maxLength={72}
                      placeholder="再次输入密码"
                      disabled={blocked}
                      aria-invalid={confirmationError ? true : undefined}
                      aria-describedby={
                        confirmationError ? "auth-error" : undefined
                      }
                      onChange={() => setConfirmationError(null)}
                    />
                  </label>
                )}
                {mode === "register" && (
                  <p className={styles.hint} id="password-help">
                    中文和特殊符号可能占多个字节；注册后需要手动登录。
                  </p>
                )}
                <button
                  className={styles.submit}
                  type="submit"
                  disabled={blocked}
                >
                  {busy
                    ? mode === "login"
                      ? "正在登录…"
                      : "正在创建账号…"
                    : mode === "login"
                      ? "登录，继续雪上旅程"
                      : "创建账号"}
                  <ArrowIcon />
                </button>
                <p className={styles.modeSwitch}>
                  {mode === "login" && <span>第一次来？</span>}
                  <button
                    type="button"
                    onClick={() =>
                      changeMode(mode === "login" ? "register" : "login")
                    }
                    disabled={busy}
                  >
                    {mode === "login" ? "立即注册" : "老朋友去登录"}
                  </button>
                </p>
              </form>
              {(session.error ||
                session.uncertain ||
                (!session.ready && !session.reading)) && (
                <button
                  className={styles.recheck}
                  type="button"
                  disabled={busy || session.reading}
                  onClick={() => void session.restore()}
                >
                  检查当前会话
                </button>
              )}
              <div className={styles.footerCopy}>
                {mode === "login" && (
                  <p className={styles.recovery}>
                    忘记密码？请联系平台管理员重置。
                  </p>
                )}
                <p className={styles.legal}>
                  使用前请阅读 <Link href={routes.terms}>用户协议</Link> 和{" "}
                  <Link href={routes.privacy}>隐私政策</Link>。
                </p>
              </div>
            </div>
          </section>
        </div>
        <noscript>
          <p className={styles.noScript}>
            登录和注册需要 JavaScript；你仍可返回首页浏览公开内容。
          </p>
        </noscript>
      </main>
      <BrandGridFooter compact>
        <button
          className={styles.backgroundControl}
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? "播放背景动效" : "暂停背景动效"}
        </button>
      </BrandGridFooter>
    </div>
  );
}
