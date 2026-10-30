import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { modeLabel } from "@/lib/format";
import { listWorkflowBoards } from "@/lib/queries";

export const metadata = { title: "发起审批" };

function workflowIcon(name: string) {
  if (name.includes("请假")) return "calendar";
  if (name.includes("报销")) return "wallet";
  if (name.includes("服务器")) return "server";
  if (name.includes("宣发") || name.includes("活动")) return "megaphone";
  if (name.includes("技术") || name.includes("支持")) return "wrench";
  return "files";
}

export default async function StartPage() {
  await getCurrentUser();
  const workflows = listWorkflowBoards();

  return (
    <>
      <PageHeader eyebrow="申请中心" title="发起审批" description="选择需要办理的事项，填写信息后提交审批。" />
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <h2 className="font-semibold">可用流程</h2>
        <span className="text-muted">共 {workflows.length} 类事项</span>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {workflows.map((workflow) => (
          <article key={workflow.id} className="card flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-teal">
                <Icon name={workflowIcon(workflow.name)} size={22} />
              </div>
              {workflow.rules.length > 0 ? <span className="pill pill-ai"><Icon name="sparkles" size={12} />AI 规则已配置</span> : null}
            </div>
            <h2 className="mt-4 text-lg font-semibold">{workflow.name}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{workflow.description}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
              <span>{workflow.fieldLabels.length} 项填写信息</span>
              <span>{workflow.steps.length} 个审批节点</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {workflow.steps.map((step, index) => (
                <span key={`${step.name}-${index}`} className="flex items-center gap-2">
                  {index > 0 ? <Icon name="chevronRight" size={13} className="text-muted" /> : null}
                  <span className="rounded-md bg-mist px-2.5 py-1.5">{step.name}</span>
                </span>
              ))}
            </div>
            <div className="mt-auto pt-5">
              <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-xs text-muted">在线填写 · 自动流转</span>
                <Link href={`/start/${workflow.id}`} className="btn btn-primary" aria-label={`填写${workflow.name}申请`}>
                  填写申请<Icon name="arrowRight" size={15} />
                </Link>
              </div>
              <details className="mt-3 text-xs leading-6 text-muted">
                <summary className="w-fit cursor-pointer rounded font-medium hover:text-teal">查看流程说明</summary>
                <div className="mt-2 border-t border-line pt-2">
                  <p>填写信息：{workflow.fieldLabels.join("、")}</p>
                  {workflow.steps.map((step, index) => (
                    <p key={`${step.name}-${index}`}>{step.name}：{step.approverNames.join("、")} · {modeLabel(step.approveMode)}</p>
                  ))}
                  {workflow.rules.map((rule, index) => (
                    <p key={`${rule.approverName}-${index}`} className="mt-2">{rule.approverName} 的自动规则：{rule.ruleText}</p>
                  ))}
                </div>
              </details>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
