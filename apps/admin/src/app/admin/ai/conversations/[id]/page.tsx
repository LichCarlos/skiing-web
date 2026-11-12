import { notFound } from "next/navigation";
import { AuditConsole } from "@/features/ai-operations/audit-console";
import { conversationAuditId } from "@/features/ai-operations/routes";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!conversationAuditId(id)) notFound();
  return <AuditConsole id={id} />;
}
