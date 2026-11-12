import { moderationId } from "@/features/community/moderation-model";
import { notFound } from "next/navigation";
import { AdminDynamicDetail } from "@/features/community/admin-dynamic-detail";

export default async function AdminDynamicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dynamicId = moderationId(id);
  if (dynamicId === null) notFound();
  return <AdminDynamicDetail key={dynamicId} dynamicId={dynamicId} />;
}
