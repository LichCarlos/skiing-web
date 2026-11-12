import { notFound } from "next/navigation";
import { ManagedUserDetail } from "@/features/users/managed-user-detail";
import { accountIdFromSegment } from "@/features/users/routes";

export default async function ManagedUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = accountIdFromSegment((await params).id);
  if (id === null) notFound();
  return <ManagedUserDetail key={id} userId={id} />;
}
