import { canViewRequest } from "@/lib/queries";
import { sqlAll } from "@/lib/db";
import type { PublicUser } from "@/lib/types";
import { Icon } from "@/components/icon";
import { formatTime } from "@/lib/format";

type Evidence = { rule: string; ruleVersion: string; mode: string; outcome: string; reason: string; automatic: boolean; knowledge: { docId: number; title: string; excerpt: string; version: string }[] };
export function ApprovalEvidence({ user, requestId }: { user: PublicUser; requestId: number }) {
  if (!canViewRequest(user, requestId)) return null;
  const rows = sqlAll<{ id: number; snapshot_json: string; created_at: string }>("SELECT id, snapshot_json, created_at FROM ai_evidence WHERE request_id = ? ORDER BY id DESC LIMIT 20", requestId);
  if (!rows.length) return null;
  return <section className="card"><h2 className="section-title"><Icon name="book" className="text-teal" />判断依据与版本</h2><p className="mt-2 text-xs text-muted">保留每次判断时的规则与制度片段，重新判断后仍可查看历史依据。</p><div className="mt-4 divide-y divide-line">{rows.map(row => { const e = JSON.parse(row.snapshot_json) as Evidence; return <details key={row.id} className="py-3"><summary className="cursor-pointer text-sm"><span className="font-medium">{e.automatic ? "自动处理" : e.mode === "suggestion" ? "人工确认建议" : "转人工 / 判断记录"}</span><span className="ml-2 text-xs text-muted">{formatTime(row.created_at)}</span></summary><div className="mt-3 space-y-3 text-xs leading-6"><p>{e.reason}</p><div className="rounded-lg bg-mist p-3"><p className="font-medium">个人规则 · 版本 {e.ruleVersion.slice(0, 10)}</p><p className="mt-1 break-words whitespace-pre-wrap">{e.rule}</p></div>{e.knowledge.map((k, i) => <div key={`${k.docId}-${i}`} className="rounded-lg border border-line p-3"><p className="font-medium">《{k.title}》 · 版本 {k.version.slice(0, 10)}</p><p className="mt-2 break-words whitespace-pre-wrap text-muted">{k.excerpt}</p></div>)}{!e.knowledge.length ? <p className="text-muted">本次没有可用的制度片段引用。</p> : null}</div></details>; })}</div></section>;
}
