import Link from "next/link";
import { decideAction, retryAction } from "@/server/actions";
import { SubmitButton } from "@/components/submit-button";
import { StatusPill } from "@/components/ui";
import { Icon } from "@/components/icon";
import { ApprovalEvidence } from "@/components/approval-evidence";
import { formatTime, modeHint, modeLabel } from "@/lib/format";
import type { AiOutcome, PublicUser, RequestDetail } from "@/lib/types";

const outcomeLabels: Record<AiOutcome, string> = {
  approve: "判断为通过",
  reject: "判断为驳回",
  manual: "转人工确认",
  error: "判断失败",
};

const outcomeStyles: Record<AiOutcome, string> = {
  approve: "border-success/20 bg-success-bg",
  reject: "border-rose/20 bg-rose-bg",
  manual: "border-amber/20 bg-amber-bg",
  error: "border-rose/20 bg-rose-bg",
};

export function RequestDetailView({ detail, user }: { detail: RequestDetail; user: PublicUser }) {
  const current = detail.steps.find((step) => step.sortOrder === detail.currentStepOrder);
  const currentApprovals = detail.approvals.filter((item) => item.stepId === current?.id);
  const alreadyDecided = currentApprovals.some((item) => item.approverId === user.id);
  const canDecide =
    detail.status === "pending" &&
    current != null &&
    current.approvers.some((approver) => approver.id === user.id) &&
    !alreadyDecided &&
    (current.approveMode === "all" || currentApprovals.length === 0);
  const newestAttempts = [...detail.attempts].reverse();
  const latestAttempts = newestAttempts.filter(
    (attempt, index) => newestAttempts.findIndex(
      (item) => item.stepId === attempt.stepId && item.approverId === attempt.approverId,
    ) === index,
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.85fr)]">
      <div className="grid min-w-0 content-start gap-5">
        <section className="card">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4 text-xs text-muted">
            <Link href="/inbox" className="inline-flex min-h-7 items-center gap-1.5 hover:text-teal"><Icon name="arrowLeft" size={14} />返回待办</Link>
            <span className="tabular-nums">申请编号 #{String(detail.id).padStart(4, "0")}</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 text-xs font-medium text-teal">{detail.workflowName}</div>
              <h1 className="text-[26px] leading-snug font-semibold break-words">{detail.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><Icon name="users" size={14} />{detail.initiatorName}</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="calendar" size={14} /><time dateTime={detail.createdAt}>{formatTime(detail.createdAt)}</time></span>
              </div>
            </div>
            <StatusPill status={detail.status} />
          </div>
          <dl className="mt-6 grid gap-x-6 gap-y-5 border-t border-line pt-5 sm:grid-cols-2">
            {detail.form.map((field) => (
              <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
                <dt className="text-xs text-muted">{field.label}</dt>
                <dd className="mt-1.5 text-sm leading-6 break-words whitespace-pre-wrap">{field.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        {latestAttempts.length > 0 ? (
          <section className="card">
            <h2 className="section-title"><Icon name="sparkles" className="text-teal" />AI 判断记录</h2>
            <p className="mt-1.5 text-xs text-muted">展示各审批人、各节点最近一次判断，实际处理结果见审批进度。</p>
            <div className="mt-4 grid gap-3">
              {latestAttempts.map((attempt) => {
                const step = detail.steps.find((item) => item.id === attempt.stepId);
                const approver = step?.approvers.find((item) => item.id === attempt.approverId);
                const tone = attempt.outcome === "approve" ? "pill-approved" : attempt.outcome === "manual" ? "pill-pending" : "pill-rejected";
                return (
                  <article key={`${attempt.stepId}-${attempt.approverId}`} className={`rounded-lg border p-4 ${outcomeStyles[attempt.outcome]}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted">{step?.name || "审批节点"} · {approver?.displayName || "审批人"}</span>
                      <span className={`pill ${tone}`}>{outcomeLabels[attempt.outcome]}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 break-words whitespace-pre-wrap">{attempt.reason || "本次判断未提供说明。"}</p>
                    {attempt.knowledgeRefs ? (
                      <div className="mt-3 flex items-start gap-2 border-t border-current/10 pt-3 text-xs leading-5 text-muted"><Icon name="book" size={14} /><span className="break-words">参考依据：{attempt.knowledgeRefs}</span></div>
                    ) : null}
                    <details className="mt-3 text-xs text-muted">
                      <summary className="w-fit cursor-pointer py-1 hover:text-ink">判断详情</summary>
                      <dl className="mt-2 grid gap-2 border-t border-current/10 pt-3">
                        <div><dt className="inline">判断时间：</dt><dd className="inline"><time dateTime={attempt.createdAt}>{formatTime(attempt.createdAt)}</time></dd></div>
                        {attempt.model ? <div className="break-all"><dt className="inline">使用模型：</dt><dd className="inline">{attempt.model}</dd></div> : null}
                      </dl>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <ApprovalEvidence user={user} requestId={detail.id} />
        <section className="card">
          <h2 className="section-title"><Icon name="clock" className="text-muted" />流转记录</h2>
          <ol className="mt-5 ml-1">
            {detail.logs.map((log, index) => (
              <li key={`${log.createdAt}-${index}`} className="timeline-item">
                <span className={`timeline-dot ${index === detail.logs.length - 1 ? "bg-teal" : ""}`} aria-hidden="true" />
                <p className="text-sm leading-6 break-words">{log.message}</p>
                <time dateTime={log.createdAt} className="mt-1 block text-xs text-muted tabular-nums">{formatTime(log.createdAt)}</time>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid min-w-0 content-start gap-5">
        <section className="card">
          <h2 className="section-title"><Icon name="workflow" className="text-teal" />审批进度</h2>
          <p className="mt-1.5 text-xs text-muted">{current ? `当前节点：${current.name}` : "本次审批已结束"}</p>
          <ol className="mt-5 ml-1">
            {detail.steps.map((step, index) => {
              const approvals = detail.approvals.filter((item) => item.stepId === step.id);
              const hasRejected = approvals.some((item) => item.decision === "rejected");
              // Match service.evaluate: an approval takes precedence in an any-sign step.
              const passed = step.approveMode === "any"
                ? approvals.some((item) => item.decision === "approved")
                : !hasRejected && step.approvers.every((approver) => approvals.some((item) => item.approverId === approver.id && item.decision === "approved"));
              const rejected = hasRejected && (step.approveMode === "all" || !passed);
              const isCurrent = detail.status === "pending" && step.id === current?.id;
              return (
                <li key={step.id} className="timeline-item">
                  <span className={`timeline-dot ${rejected ? "bg-rose" : passed ? "bg-success" : isCurrent ? "bg-amber" : ""}`} aria-hidden="true" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{index + 1}. {step.name}</h3>
                    <span className={`text-xs ${rejected ? "text-rose" : passed ? "text-success" : isCurrent ? "text-amber" : "text-muted"}`}>{rejected ? "已驳回" : passed ? "已完成" : isCurrent ? "进行中" : "未开始"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted" title={modeHint(step.approveMode)}>{modeLabel(step.approveMode)} · {step.approveMode === "any" ? "任一审批人通过即可" : "所有审批人都需通过"}</p>
                  <ul className="mt-3 grid gap-2">
                    {step.approvers.map((approver) => {
                      const approval = approvals.find((item) => item.approverId === approver.id);
                      const attempt = newestAttempts.find((item) => item.stepId === step.id && item.approverId === approver.id);
                      const noLongerNeeded = !approval && ((passed && step.approveMode === "any") || rejected || detail.status !== "pending");
                      return (
                        <li key={approver.id} className="rounded-lg bg-mist px-3 py-2.5 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{approver.displayName}</span>
                            {approval ? (
                              <span className={`pill ${approval.decision === "rejected" ? "pill-rejected" : "pill-approved"}`}>
                                {approval.source === "ai" ? "AI " : "人工"}{approval.decision === "approved" ? "通过" : "驳回"}
                              </span>
                            ) : noLongerNeeded ? (
                              <span className="pill pill-neutral">无需处理</span>
                            ) : isCurrent && attempt?.outcome === "manual" ? (
                              <span className="pill pill-pending">转人工</span>
                            ) : isCurrent && attempt?.outcome === "error" ? (
                              <span className="pill pill-rejected">AI 失败</span>
                            ) : isCurrent ? (
                              <span className="pill pill-pending">待处理</span>
                            ) : <span className="text-xs text-muted">未开始</span>}
                          </div>
                          {approval?.source === "manual" && approval.comment ? <p className="mt-1.5 text-xs leading-5 break-words text-muted">{approval.comment}</p> : null}
                          {approval?.source === "ai" ? <p className="mt-1.5 text-xs leading-5 break-words text-muted">{approval.aiReason}</p> : null}
                          {!approval && !attempt && !noLongerNeeded && approver.ruleEnabled ? <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted"><Icon name="sparkles" size={12} />到达节点后自动判断</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </section>

        {canDecide ? (
          <section className="card">
            <h2 className="section-title"><Icon name="checkCircle" className="text-teal" />处理这个节点</h2>
            <p className="mt-1.5 text-xs text-muted">{current?.name} · 请确认申请信息后提交。</p>
            <form action={decideAction} className="mt-4 grid gap-3">
              <input type="hidden" name="requestId" value={detail.id} />
              <label>
                <span className="label">审批意见</span>
                <textarea className="textarea" name="comment" placeholder="驳回时必填。通过可以不写。" />
              </label>
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="decision" value="approved" pendingText="正在提交…">
                  <Icon name="check" size={16} />通过
                </SubmitButton>
                <SubmitButton name="decision" value="rejected" className="btn btn-danger" pendingText="正在提交…">
                  <Icon name="close" size={16} />驳回
                </SubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        {detail.status === "pending" ? (
          <form action={retryAction} className="rounded-xl border border-line bg-white p-4">
            <input type="hidden" name="requestId" value={detail.id} />
            <SubmitButton className="btn btn-ghost w-full" pendingText="正在按最新规则判断…">
              <Icon name="refresh" size={15} />按最新规则重新判断
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
