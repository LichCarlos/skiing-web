import { notFound } from "next/navigation";
import RoleAuthorizationConsole from "@/features/roles/role-authorization-console";
import { roleIdFromSegment } from "@/features/roles/routes";
export default async function RoleAuthorizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = roleIdFromSegment((await params).id);
  if (id === null) notFound();
  return <RoleAuthorizationConsole key={id} roleId={id} />;
}
