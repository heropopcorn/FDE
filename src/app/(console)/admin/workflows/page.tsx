import Link from "next/link";
import { Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { modeLabel } from "@/lib/format";
import { listWorkflowBoards } from "@/lib/queries";

export const metadata = { title: "流程配置" };

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const query = await searchParams;
  const workflows = listWorkflowBoards();

  return (
    <>
      <PageHeader
        title="流程配置"
        description="流程由管理员创建。每个流程包含一张表单和一组按顺序执行的审批节点。"
        action={
          <Link href="/admin/workflows/new" className="btn btn-primary">
            新建流程
          </Link>
        }
      />
      <Flash ok={query.saved === "1" ? "流程已保存。" : ""} />
      <div className="grid gap-4">
        {workflows.map((workflow) => (
          <article key={workflow.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{workflow.name}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{workflow.description || "还没有说明"}</p>
              </div>
              <Link href={`/admin/workflows/${workflow.id}`} className="btn btn-ghost">
                编辑
              </Link>
            </div>
            <div className="mt-3 text-sm text-muted">字段：{workflow.fieldLabels.join("、") || "无"}</div>
            <div className="mt-2 text-sm">
              {workflow.steps.map((step, index) => (
                <span key={`${step.name}-${index}`}>
                  {index > 0 ? " → " : ""}
                  {step.name}（{step.approverNames.join("、") || "未指定"}，{modeLabel(step.approveMode)}）
                </span>
              ))}
            </div>
            {workflow.locked ? <p className="mt-3 text-xs text-muted">已有申请，结构已锁定。</p> : null}
          </article>
        ))}
      </div>
    </>
  );
}
