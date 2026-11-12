"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Form, Input } from "antd";
import {
  SessionInputError,
  SessionOutcomeUnknown,
} from "@/platform/auth/session-model";
import { routes } from "@/config/routes";
import { hasManagementPortalAccess } from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import styles from "@/features/auth/login.module.css";
import { AdminIcon } from "@/components/admin-icon";

interface LoginValues {
  account: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { session, signIn, signOut, retryRestore } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ busy: boolean; active: boolean }>({
    busy: false,
    active: false,
  });
  useEffect(() => {
    const lifetime = { busy: false, active: true };
    attempt.current = lifetime;
    return () => {
      lifetime.active = false;
    };
  }, []);

  useEffect(() => {
    if (
      session.status === "authenticated" &&
      hasManagementPortalAccess(session.currentUser)
    ) {
      router.replace(routes.admin);
    }
  }, [router, session]);

  async function submit(values: LoginValues) {
    const lifetime = attempt.current;
    if (!lifetime.active || lifetime.busy || session.status !== "anonymous")
      return;
    lifetime.busy = true;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(values);
    } catch (cause) {
      if (attempt.current === lifetime && lifetime.active)
        setError(
          cause instanceof SessionInputError ||
            cause instanceof SessionOutcomeUnknown
            ? cause.message
            : "登录失败，请检查当前会话后再试。",
        );
    } finally {
      lifetime.busy = false;
      if (attempt.current === lifetime && lifetime.active) setSubmitting(false);
    }
  }

  if (session.status === "loading") {
    return (
      <main className={styles.state} role="status">
        正在恢复会话...
      </main>
    );
  }

  if (session.status === "unavailable") {
    return (
      <main className={styles.state}>
        <h1>凛迹雪客管理端</h1>
        <AdminParagraph>{session.errorMessage}</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重试</Button>
        {session.canSignOut ? (
          <Button
            onClick={() =>
              void signOut().catch(() =>
                message.error("退出未完成，请检查当前会话。"),
              )
            }
          >
            退出并切换账号
          </Button>
        ) : null}
      </main>
    );
  }

  if (session.status === "authenticated") {
    if (hasManagementPortalAccess(session.currentUser)) {
      return (
        <main className={styles.state} role="status">
          正在进入管理端...
        </main>
      );
    }
    return (
      <main className={styles.state}>
        <h1>当前账号未获管理端授权</h1>
        <AdminParagraph>请联系系统管理员配置管理端入口权限。</AdminParagraph>
        <Button
          onClick={() =>
            void signOut().catch(() => message.error("退出失败，请重试。"))
          }
        >
          退出并切换账号
        </Button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.formPanel} aria-labelledby="login-title">
        <span className={styles.brandMark}>
          <AdminIcon name="mountain" width={26} height={26} />
        </span>
        <h1 id="login-title">凛迹雪客管理端</h1>
        <Form<LoginValues>
          layout="vertical"
          requiredMark={false}
          disabled={submitting}
          onFinish={(values) => void submit(values)}
          autoComplete="on"
        >
          <Form.Item
            label="账号"
            name="account"
            rules={[{ required: true, message: "请输入账号" }]}
            extra={
              <FormHint>使用已获管理端访问权限的账号登录，最多50字。</FormHint>
            }
          >
            <Input
              size="large"
              autoComplete="username"
              maxLength={50}
              placeholder="请输入账号"
            />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
            extra={<FormHint>输入当前账号密码，保留大小写及空格。</FormHint>}
          >
            <Input.Password
              size="large"
              autoComplete="current-password"
              maxLength={72}
              placeholder="请输入密码"
            />
          </Form.Item>
          {error ? (
            <Alert
              className={styles.alert}
              type="error"
              showIcon
              message={error}
            />
          ) : null}
          <Button
            block
            size="large"
            htmlType="submit"
            type="primary"
            loading={submitting}
          >
            登录
          </Button>
        </Form>
      </section>
    </main>
  );
}
