import { notFound } from "next/navigation";
import { DictionaryConsole } from "@/features/dictionaries/dictionary-console";
import { isDictionaryType } from "@/features/dictionaries/routes";

export default async function DictionaryDetailPage({
  params,
}: {
  params: Promise<{ dictType: string }>;
}) {
  const { dictType } = await params;
  if (!isDictionaryType(dictType)) notFound();
  return <DictionaryConsole initialDictType={dictType} />;
}
