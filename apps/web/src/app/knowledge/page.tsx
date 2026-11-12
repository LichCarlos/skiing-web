import { KnowledgeDirectory } from "@/features/knowledge/knowledge-directory";
import {
  loadKnowledgeDirectory,
  readKnowledgeFilters,
  type KnowledgeSearch,
} from "@/features/knowledge/knowledge-query";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<KnowledgeSearch>;
}) {
  const filters = readKnowledgeFilters(await searchParams);
  return (
    <KnowledgeDirectory
      filters={filters}
      state={await loadKnowledgeDirectory(filters)}
    />
  );
}
