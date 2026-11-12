import { notFound } from "next/navigation";
import { isAssetId } from "@/features/assets/asset-library-model";
import { AssetAdminDetail } from "@/features/assets/asset-admin-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  if (!isAssetId(assetId)) notFound();
  return <AssetAdminDetail key={assetId} assetId={assetId} />;
}
