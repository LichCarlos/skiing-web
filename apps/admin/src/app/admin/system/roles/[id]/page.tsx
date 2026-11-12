import { notFound } from "next/navigation";
import RoleConsole from "@/features/roles/role-console";
import { roleIdFromSegment } from "@/features/roles/routes";
export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = roleIdFromSegment((await params).id);
  if (id === null) notFound();
  return <RoleConsole key={id} roleId={id} />;
}
