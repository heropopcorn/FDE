import { createHash } from "node:crypto";
import { sqlOne, sqlRun } from "@/lib/db";

export function knowledgeVersion(title: string, content: string) {
  return createHash("sha256").update(JSON.stringify({ title, content })).digest("hex");
}
export function captureKnowledgeVersion(id: number) {
  const doc = sqlOne<{ id: number; title: string; content: string }>("SELECT id, title, content FROM knowledge_docs WHERE id = ?", id);
  if (!doc) return;
  const version = knowledgeVersion(doc.title, doc.content);
  sqlRun("INSERT OR IGNORE INTO knowledge_revisions (document_id, version, title, content, captured_at) VALUES (?, ?, ?, ?, ?)", id, version, doc.title, doc.content, new Date().toISOString());
  return version;
}
export function isKnowledgeCurrent(hits: { docId: number; version: string }[]) {
  return hits.every(hit => {
    const doc = sqlOne<{ title: string; content: string }>("SELECT title, content FROM knowledge_docs WHERE id = ?", hit.docId);
    return !!doc && knowledgeVersion(doc.title, doc.content) === hit.version;
  });
}
