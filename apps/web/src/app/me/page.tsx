import { MemberPage } from "@/features/member/member-page";
export const metadata = {
  title: "个人中心 · 凛迹雪客",
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
    Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const tab = query.tab === "favorites" ? "favorites" : "notes";
  const type =
    query.type === "article" || query.type === "resort"
      ? query.type
      : "dynamic";
  const status = ["pending", "published", "hidden"].includes(
    String(query.status),
  )
    ? (query.status as "pending" | "published" | "hidden")
    : "all";
  return (
    <MemberPage
      mode="library"
      tab={tab}
      type={type}
      page={page}
      status={status}
    />
  );
}
