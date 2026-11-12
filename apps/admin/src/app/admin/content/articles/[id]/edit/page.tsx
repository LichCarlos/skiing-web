import { notFound } from "next/navigation";
import { AdminArticleForm } from "@/features/articles/admin-article-form";
import { articleIdFromSegment } from "@/features/articles/article-model";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const articleId = articleIdFromSegment((await params).id);
  if (articleId === null) notFound();
  return <AdminArticleForm key={articleId} articleId={articleId} />;
}
