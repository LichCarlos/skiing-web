import { FeedDirectory } from "@/features/community/feed-directory";
import {
  loadFeed,
  readFeedFilters,
  type FeedSearch,
} from "@/features/community/feed-query";
export default async function DynamicsPage({
  searchParams,
}: {
  searchParams: Promise<FeedSearch>;
}) {
  const filters = readFeedFilters(await searchParams);
  return <FeedDirectory filters={filters} state={await loadFeed(filters)} />;
}
