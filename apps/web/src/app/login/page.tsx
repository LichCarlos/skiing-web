import type { Metadata } from "next";
import { AuthPage } from "@/features/auth/auth-page";
import { safeReturnPath } from "@/features/auth/auth-model";

export const metadata: Metadata = {
  title: "登录与注册 · 凛迹雪客",
  description: "登录凛迹雪客，收藏滑雪知识，继续你的雪上旅程。",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthPage
      initialMode={params.mode === "register" ? "register" : "login"}
      returnTo={safeReturnPath(params.returnTo)}
    />
  );
}
