import { notFound } from "next/navigation";
import { MerchantResortForm } from "@/features/merchant-resorts/merchant-resort-form";
import { resortId as parseResortId } from "@/features/merchant-resorts/resort-model";

export default async function EditMerchantResortPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resortId = parseResortId(id);
  if (resortId === null) notFound();
  return <MerchantResortForm key={id} resortId={resortId} />;
}
