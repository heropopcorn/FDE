import Link from "next/link";
import { decideAction, retryAction } from "@/server/actions";
import { SubmitButton } from "@/components/submit-button";
import { StatusPill } from "@/components/ui";
import { formatTime, modeHint, modeLabel } from "@/lib/format";
import type { PublicUser, RequestDetail } from "@/lib/types";

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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <div className="grid gap-5">
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-teal-dark">{detail.workflowName}</div>
              <h1 className="mt-1 text-2xl font-semibold">{detail.title}</h1>
              <p className="mt-2 text-sm text-muted">
                {detail.initiatorName} 发起于 {formatTime(detail.createdAt)}
              </p>
            </div>
            <StatusPill status={detail.status} />
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {detail.form.map((field) => (
              <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
                <dt className="text-sm font-semibold text-teal-dark">{field.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap">{field.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">流转记录</h2>
          <ol className="mt-4 grid gap-3">
            {detail.logs.map((log, index) => (
              <li key={`${log.createdAt}-${index}`} className="flex gap-3 text-sm">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal" />
                <span>
                  <span>{log.message}</span>
                  <span className="ml-2 text-muted">{formatTime(log.createdAt)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid content-start gap-5">
        <section className="card">
          <h2 className="text-lg font-semibold">审批链</h2>
          <ol className="mt-4 grid gap-4">
            {detail.steps.map((step, index) => (
              <li key={step.id} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">
                    {index + 1}. {step.name}
                  </div>
                  <span className="text-xs text-muted" title={modeHint(step.approveMode)}>
                    {modeLabel(step.approveMode)}
                  </span>
                </div>
                <ul className="mt-3 grid gap-2">
                  {step.approvers.map((approver) => {
                    const approval = detail.approvals.find(
                      (item) => item.stepId === step.id && item.approverId === approver.id,
                    );
                    const attempt = detail.attempts.find(
                      (item) => item.stepId === step.id && item.approverId === approver.id,
                    );
                    return (
                      <li key={approver.id} className="rounded-2xl bg-mist px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{approver.displayName}</span>
                          {approval ? (
                            <span className={approval.source === "ai" ? "pill pill-ai" : approval.decision === "approved" ? "pill pill-approved" : "pill pill-rejected"}>
                              {approval.source === "ai" ? "AI " : "人工"}
                              {approval.decision === "approved" ? "通过" : "驳回"}
                            </span>
                          ) : attempt?.outcome === "manual" ? (
                            <span className="pill pill-pending">转人工</span>
                          ) : attempt?.outcome === "error" ? (
                            <span className="pill pill-rejected">AI 失败</span>
                          ) : detail.status === "pending" && step.id === current?.id ? (
                            <span className="pill pill-pending">待处理</span>
                          ) : (
                            <span className="text-xs text-muted">未开始</span>
                          )}
                        </div>
                        {approval?.source === "ai" ? <p className="mt-1 text-muted">{approval.aiReason}</p> : null}
                        {approval?.source === "manual" && approval.comment ? <p className="mt-1 text-muted">{approval.comment}</p> : null}
                        {!approval && attempt ? <p className="mt-1 text-muted">{attempt.reason}</p> : null}
                        {attempt?.model ? <p className="mt-1 text-xs text-muted">模型 {attempt.model}</p> : null}
                        {attempt?.knowledgeRefs ? <p className="mt-1 text-xs text-muted">参考知识库：{attempt.knowledgeRefs}</p> : null}
                        {!approval && !attempt && approver.ruleEnabled ? (
                          <p className="mt-1 text-xs text-muted">已配置自动规则，轮到该节点时才会执行</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        {canDecide ? (
          <section className="card">
            <h2 className="text-lg font-semibold">处理这个节点</h2>
            <form action={decideAction} className="mt-4 grid gap-3">
              <input type="hidden" name="requestId" value={detail.id} />
              <label>
                <span className="label">意见</span>
                <textarea className="textarea" name="comment" placeholder="驳回时必填。通过可以不写。" />
              </label>
              <div className="flex gap-2">
                <SubmitButton name="decision" value="approved" pendingText="正在提交…">
                  通过
                </SubmitButton>
                <SubmitButton name="decision" value="rejected" className="btn btn-danger" pendingText="正在提交…">
                  驳回
                </SubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        {detail.status === "pending" ? (
          <form action={retryAction}>
            <input type="hidden" name="requestId" value={detail.id} />
            <SubmitButton className="btn btn-ghost" pendingText="正在按最新规则判断…">
              按最新规则重新判断
            </SubmitButton>
          </form>
        ) : null}

        <Link href="/inbox" className="text-sm text-teal-dark">
          返回待办
        </Link>
      </div>
    </div>
  );
}
