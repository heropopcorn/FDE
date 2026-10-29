import Link from "next/link";
import { KnowledgeEditor } from "@/components/knowledge-editor";
import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteKnowledgeAction, reindexKnowledgeAction } from "@/server/actions";
import { requireAdmin } from "@/lib/auth";
import { formatTime, oneParam } from "@/lib/format";
import { listKnowledgeDocs } from "@/lib/queries";
import { knowledgeStatus } from "@/lib/vector-store";

export const metadata = { title: "知识库" };

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; indexed?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const docs = listKnowledgeDocs();
  const status = await knowledgeStatus();
  const ok = query.deleted === "1" ? "规范已删除。" : query.indexed === "1" ? "规范已重新写入向量库。" : "";

  return (
    <>
      <PageHeader
        title="知识库"
        description="规范正文存在本地数据库。向量由本机的 bge-large-zh 模型生成，写入 Redis。"
        action={
          <Link href="/admin/knowledge/new" className="btn btn-primary">
            新建规范
          </Link>
        }
      />
      <Flash error={oneParam(query.error)} ok={ok} />
      <div className={`flash ${status.ok ? "flash-ok" : "flash-bad"}`}>
        {status.ok
          ? `Redis 向量库已连接，当前索引 ${status.documents} 条。`
          : `Redis 向量库未连接：${status.error}。请先启动 docker compose up -d。`}
      </div>
      <form action={reindexKnowledgeAction} className="mb-4">
        <SubmitButton className="btn btn-ghost" pendingText="正在写入向量库…">
          重新写入向量库
        </SubmitButton>
      </form>
      <div className="grid gap-3">
        {docs.map((doc) => (
          <article key={doc.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{doc.title}</h2>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted">{doc.content}</p>
                <p className="mt-2 text-xs text-muted">更新于 {formatTime(doc.updatedAt)}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/admin/knowledge/${doc.id}`} className="btn btn-ghost">
                  编辑
                </Link>
                <form action={deleteKnowledgeAction}>
                  <input type="hidden" name="id" value={doc.id} />
                  <SubmitButton className="btn btn-danger" pendingText="删除中…">
                    删除
                  </SubmitButton>
                </form>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
