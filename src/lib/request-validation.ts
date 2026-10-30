import type { FormAnswer, Result, Workflow, WorkflowField } from "@/lib/types";

export function readAnswer(field: WorkflowField, raw: string): Result<string> {
  if (typeof raw !== "string") return { ok: false, error: `${field.label}的格式不正确` };
  const value = raw.trim();
  if (!value) return field.required ? { ok: false, error: `请填写${field.label}` } : { ok: true, data: "" };
  if (field.fieldType === "number") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return { ok: false, error: `${field.label}需要填写有效数字` };
    if (/天数|金额|预算/.test(field.label) && numeric <= 0) return { ok: false, error: `${field.label}必须大于 0` };
    if (Math.abs(numeric) > 1e12) return { ok: false, error: `${field.label}超出允许范围` };
    return { ok: true, data: String(numeric) };
  }
  if (field.fieldType === "date") {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return { ok: false, error: `${field.label}需要填写真实日期（年-月-日）` };
    }
  }
  if (field.fieldType === "select" && !field.options.includes(value)) return { ok: false, error: `${field.label}的选项无效` };
  if (value.length > (field.fieldType === "textarea" ? 2000 : 200)) return { ok: false, error: `${field.label}太长了` };
  return { ok: true, data: value };
}

export function validateRequest(workflow: Workflow, title: string, raw: Record<string, string>): Result<FormAnswer[]> {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 80) return { ok: false, error: "请填写 80 字以内的申请标题" };
  if (!workflow.steps.length) return { ok: false, error: "这个流程还没有审批节点" };
  const form: FormAnswer[] = [];
  for (const field of workflow.fields) {
    const answer = readAnswer(field, raw[field.fieldKey] ?? "");
    if (!answer.ok) return answer;
    form.push({ key: field.fieldKey, label: field.label, type: field.fieldType, value: answer.data });
  }
  return { ok: true, data: form };
}
