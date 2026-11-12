import { MemberPage } from "@/features/member/member-page";
import { aiConversationId } from "@/features/ai/ai-validation";

export const metadata = {
  title: "我的 AI 对话 · 凛迹雪客",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const rawPage = typeof query.page === "string" ? Number(query.page) : 1;
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000
      ? rawPage
      : 1;
  return (
    <MemberPage
      mode="ai"
      conversationId={aiConversationId(query.conversation) ?? undefined}
      page={page}
    />
  );
}
