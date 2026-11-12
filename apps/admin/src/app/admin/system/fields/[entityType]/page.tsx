import { notFound } from "next/navigation";
import CustomFieldsPage from "@/features/custom-fields/field-console";
import { isFieldEntity } from "@/features/custom-fields/routes";

export default async function FieldEntityPage({
  params,
}: {
  params: Promise<{ entityType: string }>;
}) {
  const { entityType } = await params;
  if (!isFieldEntity(entityType)) notFound();
  return <CustomFieldsPage initialEntityType={entityType} />;
}
