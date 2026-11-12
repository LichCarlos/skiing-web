import { notFound } from "next/navigation";
import { MemberPage } from "@/features/member/member-page";
export const metadata = {
  title: "管理笔记 · 凛迹雪客",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <MemberPage mode="write" noteId={Number(id)} />;
}
