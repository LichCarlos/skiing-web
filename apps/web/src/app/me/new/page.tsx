import { MemberPage } from "@/features/member/member-page";
export const metadata = {
  title: "写笔记 · 凛迹雪客",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <MemberPage mode="write" />;
}
