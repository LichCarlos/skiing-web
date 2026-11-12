import { notFound } from "next/navigation";
import { RagConsole } from "@/features/ai-operations/rag-console";
import { ragSourceId } from "@/features/ai-operations/routes";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = ragSourceId((await params).id);
  if (id === null) notFound();
  return <RagConsole id={id} />;
}
