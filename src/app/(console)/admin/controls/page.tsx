import { requireAdmin } from "@/lib/auth";
import { approvalMode, listGuards } from "@/lib/approval-controls";
import { listApprovalJobs } from "@/lib/approval-jobs";
import Link from "next/link";
import { getWorkflow, listWorkflowBoards } from "@/lib/queries";
import { sqlAll } from "@/lib/db";
import { addGuardAction, retryJobAction, setModeAction, toggleGuardAction } from "@/server/control-actions";
import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icon";
import { formatTime } from "@/lib/format";

export const metadata = { title: "审批控制" };
const operators: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
const actions: Record<string, string> = { "request.submit": "对话提交", "request.query": "查询单据", "draft.update": "更新草稿", "draft.cancel": "取消草稿", "approval.mode": "切换审批模式", "guard.create": "配置数值规则", "guard.toggle": "调整数值规则", "job.retry": "恢复后台任务" };

export default async function ControlsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const mode = approvalMode();
  const workflows = listWorkflowBoards().map(w => getWorkflow(w.id)!);
  const guards = listGuards();
  const jobs = listApprovalJobs();
  const logs = sqlAll<{ id: number; display_name: string; action: string; detail: string; request_id: number | null; created_at: string }>("SELECT a.*, u.display_name FROM operation_audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 30");
  return <>
    <PageHeader eyebrow="管理空间" title="审批控制" description="调整自动处理方式，配置必须转人工的数值条件，并查看关键操作记录。" />
    <Flash error={params.error} ok={params.saved ? "配置已保存" : undefined} />
    <section className="card"><h2 className="section-title"><Icon name="settings" className="text-teal" />审批运行模式</h2><form action={setModeAction} className="mt-4"><div className="grid gap-3 lg:grid-cols-3">{[
      { value: "automatic", title: "自动处理", detail: "按个人规则判断，数值校验和制度依据通过后执行结果。" },
      { value: "suggestion", title: "建议模式", detail: "AI 保留判断建议，由当前审批人确认通过或驳回。适合试点。" },
      { value: "paused", title: "暂停自动审批", detail: "停止新的自动判断和自动处理，保留人工审批及对话发起与查询。" },
    ].map(item => <label key={item.value} className={`cursor-pointer rounded-xl border p-4 ${mode === item.value ? "border-teal/40 bg-mint" : "border-line"}`}><span className="flex items-center gap-2 font-medium"><input type="radio" name="mode" value={item.value} defaultChecked={mode === item.value} />{item.title}</span><p className="mt-2 text-xs leading-6 text-muted">{item.detail}</p></label>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">切换模式不撤销已经完成的审批。暂停后，执行中的判断返回时也会停止自动执行。</p><SubmitButton>保存模式</SubmitButton></div></form></section>
    <section className="card mt-5"><h2 className="section-title"><Icon name="workflow" className="text-teal" />数值规则</h2><p className="mt-2 text-xs leading-6 text-muted">命中任意启用条件时转人工，优先于模型判断。请按业务制度填写阈值；修改规则后可在单据中重新判断。</p>
      <form action={addGuardAction} className="mt-5 grid items-end gap-3 md:grid-cols-[minmax(180px,1fr)_90px_110px_minmax(180px,1fr)_auto]"><div><label className="label" htmlFor="guard-field">流程 / 数字字段</label><select id="guard-field" name="field" className="select" required>{workflows.flatMap(w => w.fields.filter(f => f.fieldType === "number").map(f => <option key={`${w.id}:${f.fieldKey}`} value={`${w.id}:${f.fieldKey}`}>{w.name} / {f.label}</option>))}</select></div><div><label className="label" htmlFor="guard-op">条件</label><select id="guard-op" name="operator" className="select">{Object.entries(operators).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div><div><label className="label" htmlFor="guard-limit">阈值</label><input id="guard-limit" name="threshold" type="number" step="any" required className="input" /></div><div><label className="label" htmlFor="guard-reason">转人工原因</label><input id="guard-reason" name="reason" required maxLength={120} className="input" placeholder="例如：超过免人工审批额度" /></div><SubmitButton>添加规则</SubmitButton></form>
      <div className="mt-5 overflow-x-auto">{guards.length ? <table className="data-table"><thead><tr><th>流程</th><th>触发条件</th><th>规则说明</th><th>状态</th><th>操作</th></tr></thead><tbody>{guards.map(guard => { const workflow = workflows.find(w => w.id === guard.workflow_id); return <tr key={guard.id}><td>{workflow?.name}</td><td>{workflow?.fields.find(f => f.fieldKey === guard.field_key)?.label} {operators[guard.operator]} {guard.threshold}</td><td>{guard.reason}</td><td><span className={`pill ${guard.enabled ? "pill-approved" : "pill-neutral"}`}>{guard.enabled ? "启用" : "停用"}</span></td><td><form action={toggleGuardAction}><input type="hidden" name="id" value={guard.id} /><input type="hidden" name="enabled" value={guard.enabled ? "0" : "1"} /><button className="btn btn-ghost min-h-8 py-1 text-xs" type="submit">{guard.enabled ? "停用" : "启用"}</button></form></td></tr>; })}</tbody></table> : <p className="rounded-lg bg-mist p-4 text-sm text-muted">尚未配置数值规则。添加后，系统会在模型判断前及执行前复核。</p>}</div>
    </section>
    <section className="card mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title"><Icon name="clock" className="text-teal" />后台任务</h2><p className="mt-2 text-xs leading-6 text-muted">中断的处理会自动恢复；连续失败 5 次后等待管理员处理。这里展示最早的 30 项未完成任务。</p></div><Link href="/admin/controls" className="btn btn-ghost text-xs">刷新状态</Link></div>
      {jobs.length ? <div className="mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>单据</th><th>状态</th><th>失败次数</th><th>最近异常</th><th>操作</th></tr></thead><tbody>{jobs.map(job => <tr key={job.request_id}><td><Link className="text-teal" href={`/requests/${job.request_id}`}>#{job.request_id} · {job.title}</Link></td><td><span className={`pill ${job.state === "failed" ? "pill-rejected" : "pill-pending"}`}>{job.running ? "处理中" : job.state === "failed" ? "需处理" : "等待恢复"}</span></td><td>{job.attempts}</td><td className="max-w-sm break-words text-xs">{job.last_error || "—"}</td><td><form action={retryJobAction}><input type="hidden" name="requestId" value={job.request_id} /><SubmitButton className="btn btn-ghost text-xs" disabled={!!job.running}>重新排队</SubmitButton></form></td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-lg bg-mint p-4 text-sm text-teal">目前没有等待恢复的任务。</p>}
    </section>
    <section className="mt-5 overflow-hidden rounded-xl border border-line bg-white"><div className="border-b border-line px-5 py-4"><h2 className="font-semibold">操作记录</h2><p className="mt-1 text-xs text-muted">展示最近 30 条记录，记录只追加，保留操作者、动作及关联单据。</p></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>操作时间</th><th>操作者</th><th>动作</th><th>说明</th><th>关联单据</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td className="whitespace-nowrap text-xs">{formatTime(log.created_at)}</td><td>{log.display_name}</td><td>{actions[log.action] ?? log.action}</td><td className="text-xs">{log.detail}</td><td>{log.request_id ? <Link className="text-teal" href={`/requests/${log.request_id}`}>#{log.request_id}</Link> : "—"}</td></tr>)}</tbody></table>{!logs.length && <p className="p-6 text-center text-sm text-muted">暂无操作记录</p>}</div></section>
  </>;
}

