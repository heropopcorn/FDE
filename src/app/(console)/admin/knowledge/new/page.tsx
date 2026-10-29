import { KnowledgeEditor } from "@/components/knowledge-editor";
import { Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { oneParam } from "@/lib/format";

export const metadata = { title: "新建规范" };

export default async function NewKnowledgePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const query = await searchParams;

  return (
    <>
      <PageHeader title="新建规范" description="保存后会切成片段，并把向量写入 Redis。" />
      <Flash error={oneParam(query.error)} />
      <KnowledgeEditor />
    </>
  );
}
