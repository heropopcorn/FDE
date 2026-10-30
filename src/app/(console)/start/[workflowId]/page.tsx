import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/submit-button";
import { Flash, PageHeader } from "@/components/ui";
import { startRequestAction } from "@/server/actions";
import { getCurrentUser } from "@/lib/auth";
import { modeLabel, oneParam, todayInput } from "@/lib/format";
import { getWorkflow, listRulesForWorkflow } from "@/lib/queries";
import type { WorkflowField } from "@/lib/types";
import { randomUUID } from "node:crypto";

export const metadata = { title: "填写申请" };

function FieldControl({ field, today }: { field: WorkflowField; today: string }) {
  const name = `field:${field.fieldKey}`;
  if (field.fieldType === "textarea") {
    return <textarea className="textarea" name={name} required={field.required} maxLength={2000} />;
  }
  if (field.fieldType === "select") {
    return (
      <select className="select" name={name} required={field.required} defaultValue="">
        <option value="" disabled>
          请选择
        </option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  const type = field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text";
  return (
    <input
      className="input"
      type={type}
      name={name}
      required={field.required}
      step={field.fieldType === "number" ? "any" : undefined}
      defaultValue={field.fieldType === "date" ? today : undefined}
      maxLength={field.fieldType === "text" ? 200 : undefined}
    />
  );
}

export default async function StartFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await getCurrentUser();
  const { workflowId } = await params;
  const query = await searchParams;
  const workflow = getWorkflow(Number(workflowId));
  if (!workflow) notFound();
  const rules = listRulesForWorkflow(workflow.id).filter((rule) => rule.enabled === 1 && rule.rule_text.trim());
  const today = todayInput();

  return (
    <>
      <PageHeader
        eyebrow={workflow.name}
        title="填写申请"
        description={workflow.description}
        action={<Link href="/start" className="btn btn-ghost">返回申请中心</Link>}
      />
      <Flash error={oneParam(query.error)} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form action={startRequestAction} className="card">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
            <h2 className="flex items-center gap-2 font-semibold"><Icon name="files" size={18} className="text-teal" />申请信息</h2>
            <span className="text-xs text-muted"><span className="text-rose">*</span> 为必填项</span>
          </div>
          <input type="hidden" name="workflowId" value={workflow.id} />
          <input type="hidden" name="submissionKey" value={randomUUID()} />
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">申请标题 <span className="text-rose" aria-hidden="true">*</span></span>
              <input className="input" name="title" required maxLength={80} placeholder="简要说明本次申请事项" />
            </label>
            {workflow.fields.map((field) => (
              <label key={field.id} className={field.fieldType === "textarea" ? "sm:col-span-2" : undefined}>
                <span className="label">
                  {field.label} {field.required ? <span className="text-rose" aria-hidden="true">*</span> : <span className="font-normal text-muted">（选填）</span>}
                </span>
                <FieldControl field={field} today={today} />
              </label>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
            <p className="max-w-md text-xs leading-5 text-muted">提交后将进入审批流程；如已配置 AI 规则，会自动进行判断。</p>
            <SubmitButton pendingText="正在提交，并执行自动审批…">提交申请<Icon name="arrowRight" size={16} /></SubmitButton>
          </div>
        </form>
        <aside className="grid gap-4" aria-label="流程说明">
          <section className="card">
            <h2 className="font-semibold">审批流程</h2>
            <p className="mt-1 text-xs text-muted">提交后依次流转至以下节点</p>
            <ol className="mt-5">
              {workflow.steps.map((step, index) => (
                <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < workflow.steps.length - 1 ? <span className="absolute top-8 bottom-1 left-3.5 w-px bg-line" aria-hidden="true" /> : null}
                  <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mint text-xs font-semibold text-teal">{index + 1}</span>
                  <div className="min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{step.name}<span className="rounded bg-mist px-1.5 py-0.5 text-xs font-normal text-muted">{modeLabel(step.approveMode)}</span></div>
                    <p className="mt-1 text-xs leading-5 text-muted">{step.approvers.map((item) => item.displayName).join("、")}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {rules.length > 0 ? (
            <section className="rounded-xl border border-teal/15 bg-mint p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-teal-dark"><Icon name="sparkles" size={17} />AI 审批辅助</h2>
              <p className="mt-2 text-xs leading-6 text-muted">已有 {rules.length} 条启用中的规则，流转到对应审批人时生效。</p>
              <details className="mt-3 text-xs leading-6">
                <summary className="w-fit cursor-pointer rounded font-medium text-teal-dark">查看已启用规则</summary>
                <div className="mt-2 grid gap-3 border-t border-teal/15 pt-3">
                  {rules.map((rule) => (
                    <div key={rule.user_id}>
                      <p className="font-medium">{rule.display_name}</p>
                      <p className="mt-1 whitespace-pre-wrap text-muted">{rule.rule_text}</p>
                      {rule.use_knowledge === 1 ? <p className="mt-1 text-teal-dark">已启用知识库参考</p> : null}
                    </div>
                  ))}
                </div>
              </details>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
