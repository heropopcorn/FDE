import { notFound } from "next/navigation";
import { KnowledgeEditor } from "@/components/knowledge-editor";
import { Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { oneParam } from "@/lib/format";
import { getKnowledgeDoc } from "@/lib/queries";

export const metadata = { title: "编辑规范" };

export default async function EditKnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const doc = getKnowledgeDoc(Number(id));
  if (!doc) notFound();

  return (
    <>
      <PageHeader eyebrow="知识库" title={doc.title} description="修改后会覆盖这条规范在 Redis 里的向量。" />
      <Flash error={oneParam(query.error)} ok={query.saved === "1" ? "已保存，并写入向量库。" : ""} />
      <KnowledgeEditor doc={doc} />
    </>
  );
}
