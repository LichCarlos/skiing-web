import { ProjectKnowledgeForm } from "@/features/project-knowledge/project-knowledge-form";
import { notFound } from "next/navigation";
import { knowledgeId } from "@/features/project-knowledge/knowledge-model";

export default async function EditProjectKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectKnowledgeId = knowledgeId(id);
  if (projectKnowledgeId === null) notFound();
  return (
    <ProjectKnowledgeForm key={projectKnowledgeId} id={projectKnowledgeId} />
  );
}
