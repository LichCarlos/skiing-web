import { ResortDirectory } from "@/features/resorts/resort-directory";
import {
  loadResortDirectory,
  loadResortFitTags,
  readResortFilters,
  type Search,
} from "@/features/resorts/resort-query";

export default async function ResortsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const filters = readResortFilters(await searchParams);
  const [state, fitTags] = await Promise.all([
    loadResortDirectory(filters),
    loadResortFitTags(),
  ]);
  return <ResortDirectory filters={filters} state={state} fitTags={fitTags} />;
}
