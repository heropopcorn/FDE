import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { modeLabel } from "@/lib/format";
import { listWorkflowBoards } from "@/lib/queries";

export const metadata = { title: "发起审批" };

export default async function StartPage() {
  await getCurrentUser();
  const workflows = listWorkflowBoards();

  return (
    <>
      <PageHeader title="发起审批" description="选择一个流程，填写表单后提交。当前节点如果配了自动规则，会在提交时立刻判断。" />
      <div className="grid gap-4">
        {workflows.map((workflow) => (
          <article key={workflow.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{workflow.name}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{workflow.description}</p>
              </div>
              <Link href={`/start/${workflow.id}`} className="btn btn-primary">
                填写申请
              </Link>
            </div>
            <div className="mt-4 text-sm text-muted">字段：{workflow.fieldLabels.join("、")}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {workflow.steps.map((step, index) => (
                <span key={step.name} className="flex items-center gap-2">
                  {index > 0 ? <span className="text-muted">→</span> : null}
                  <span className="rounded-full bg-mint px-3 py-1">
                    {step.name}
                    <span className="text-muted"> · {step.approverNames.join("、")} · {modeLabel(step.approveMode)}</span>
                  </span>
                </span>
              ))}
            </div>
            {workflow.rules.length > 0 ? (
              <div className="mt-4 rounded-2xl bg-mint px-4 py-3 text-sm text-teal-dark">
                已有 {workflow.rules.length} 条启用中的自动规则。例如 {workflow.rules[0].approverName}：{workflow.rules[0].ruleText}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
