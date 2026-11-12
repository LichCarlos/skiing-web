import { connection } from "next/server";
import { loadFeaturedContent } from "@/features/home/featured-content";
import { HomePageView } from "@/features/home/home-page-view";

export default async function Page() {
  // A build-time API outage must never freeze the homepage into its error state.
  await connection();
  return <HomePageView {...await loadFeaturedContent()} />;
}
