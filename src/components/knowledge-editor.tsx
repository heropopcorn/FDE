import { saveKnowledgeAction } from "@/server/actions";
import { SubmitButton } from "@/components/submit-button";

export function KnowledgeEditor({
  doc,
}: {
  doc?: { id: number; title: string; content: string };
}) {
  return (
    <form action={saveKnowledgeAction} className="card grid gap-4">
      {doc ? <input type="hidden" name="id" value={doc.id} /> : null}
      <label>
        <span className="label">规范名称</span>
        <input className="input" name="title" required maxLength={40} defaultValue={doc?.title ?? ""} placeholder="例如：请假规范" />
      </label>
      <label>
        <span className="label">正文</span>
        <textarea className="textarea" name="content" rows={16} defaultValue={doc?.content ?? ""} placeholder="写成可判断的条款，例如：超过 5 天不得自动通过。" />
      </label>
      <label>
        <span className="label">或上传 txt / md</span>
        <input className="input" type="file" name="file" accept=".txt,.md,text/plain,text/markdown" />
      </label>
      <p className="text-xs text-muted">上传文件后，会用文件内容作为正文，并重新写入 Redis 向量库。</p>
      <SubmitButton pendingText="正在保存并写入向量库…">保存并写入向量库</SubmitButton>
    </form>
  );
}
