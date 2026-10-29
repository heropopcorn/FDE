import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Flash, PageHeader } from "@/components/ui";
import { startRequestAction } from "@/server/actions";
import { getCurrentUser } from "@/lib/auth";
import { modeLabel, oneParam, todayInput } from "@/lib/format";
import { getWorkflow, listRulesForWorkflow } from "@/lib/queries";
import type { WorkflowField } from "@/lib/types";

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

  return (
    <>
      <PageHeader eyebrow={workflow.name} title="填写申请" description={workflow.description} />
      <Flash error={oneParam(query.error)} />
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        {workflow.steps.map((step, index) => (
          <span key={step.id} className="rounded-full bg-white px-3 py-1">
            {index + 1}. {step.name} · {step.approvers.map((item) => item.displayName).join("、")} · {modeLabel(step.approveMode)}
          </span>
        ))}
      </div>
      {rules.length > 0 ? (
        <div className="flash flash-ok">
          {rules.map((rule) => (
            <p key={rule.user_id}>
              {rule.display_name} 的自动规则：{rule.rule_text}
              {rule.use_knowledge === 1 ? " 审批时会参考知识库。" : ""}
            </p>
          ))}
        </div>
      ) : null}
      <form action={startRequestAction} className="card grid gap-4">
        <input type="hidden" name="workflowId" value={workflow.id} />
        <label>
          <span className="label">申请标题</span>
          <input className="input" name="title" required maxLength={80} placeholder="例如：回家办事 2 天" />
        </label>
        {workflow.fields.map((field) => (
          <label key={field.id}>
            <span className="label">
              {field.label}
              {field.required ? "" : "（选填）"}
            </span>
            <FieldControl field={field} today={todayInput()} />
          </label>
        ))}
        <div>
          <SubmitButton pendingText="正在提交，并执行自动审批…">提交申请</SubmitButton>
          <p className="mt-3 text-sm text-muted">当前审批人如果启用了规则，提交后会调用免费模型，通常需要几秒到二十秒。</p>
        </div>
      </form>
    </>
  );
}
