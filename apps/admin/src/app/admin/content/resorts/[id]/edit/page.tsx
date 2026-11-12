import { notFound } from "next/navigation";
import { MerchantResortForm } from "@/features/merchant-resorts/merchant-resort-form";
import { resortId } from "@/features/merchant-resorts/resort-model";

export default async function EditAdminResortPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const target = resortId(id);
  if (target === null) notFound();
  return <MerchantResortForm key={id} scope="admin" resortId={target} />;
}
