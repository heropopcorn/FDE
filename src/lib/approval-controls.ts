import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { sqlAll, sqlOne, sqlRun } from "@/lib/db";
import type { FormAnswer, PublicUser, Result } from "@/lib/types";
import { getWorkflow } from "@/lib/queries";

export type ApprovalMode = "automatic" | "suggestion" | "paused";
export type NumericGuard = { id: number; workflow_id: number; field_key: string; operator: "gt" | "gte" | "lt" | "lte" | "eq"; threshold: number; reason: string; enabled: number };
export function approvalMode(): ApprovalMode {
  const value = sqlOne<{ value: string }>("SELECT value FROM app_meta WHERE key = 'approval_mode'")?.value;
  return value === "paused" || value === "suggestion" ? value : "automatic";
}
function controlAudit(user: PublicUser, action: string, detail: string) {
  sqlRun("INSERT INTO operation_audit (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)", user.id, action, detail, new Date().toISOString());
}
export function setApprovalMode(user: PublicUser, mode: string): Result<ApprovalMode> {
  if (user.role !== "admin") return { ok: false, error: "只有管理员可以调整审批模式" };
  if (!["automatic", "suggestion", "paused"].includes(mode)) return { ok: false, error: "模式无效" };
  const names = { automatic: "自动处理", suggestion: "建议模式", paused: "暂停自动审批" };
  const previous = names[approvalMode()];
  sqlRun("INSERT INTO app_meta (key, value) VALUES ('approval_mode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", mode);
  controlAudit(user, "approval.mode", `${previous} → ${names[mode as ApprovalMode]}`);
  return { ok: true, data: mode as ApprovalMode };
}
export function listGuards(workflowId?: number) {
  return workflowId === undefined ? sqlAll<NumericGuard>("SELECT * FROM workflow_guards ORDER BY workflow_id, id") : sqlAll<NumericGuard>("SELECT * FROM workflow_guards WHERE workflow_id = ? AND enabled = 1 ORDER BY id", workflowId);
}
export function evaluateGuards(workflowId: number, form: FormAnswer[]) {
  for (const guard of listGuards(workflowId)) {
    const value = form.find(f => f.key === guard.field_key)?.value;
    const number = Number(value);
    if (value === undefined || value.trim() === "" || !Number.isFinite(number)) return `数值规则无法校验：${guard.reason}，转人工确认`;
    const threshold = guard.threshold;
    const matches = guard.operator === "gt" ? number > threshold : guard.operator === "gte" ? number >= threshold : guard.operator === "lt" ? number < threshold : guard.operator === "lte" ? number <= threshold : number === threshold;
    if (matches) return `命中数值规则：${guard.reason}，转人工确认`;
  }
  return null;
}
export function addGuard(user: PublicUser, input: { workflowId: number; fieldKey: string; operator: string; threshold: number; reason: string }): Result<number> {
  if (user.role !== "admin") return { ok: false, error: "只有管理员可以配置数值规则" };
  const w = getWorkflow(input.workflowId);
  if (!w?.fields.some(f => f.fieldKey === input.fieldKey && f.fieldType === "number")) return { ok: false, error: "请选择流程中的数字字段" };
  if (!["gt", "gte", "lt", "lte", "eq"].includes(input.operator) || !Number.isFinite(input.threshold) || Math.abs(input.threshold) > 1e12) return { ok: false, error: "比较条件或阈值无效" };
  if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 120) return { ok: false, error: "请填写 120 字以内的规则说明" };
  const result = sqlRun("INSERT INTO workflow_guards (workflow_id, field_key, operator, threshold, reason) VALUES (?, ?, ?, ?, ?)", input.workflowId, input.fieldKey, input.operator, input.threshold, input.reason.trim());
  controlAudit(user, "guard.create", `规则 ${result.lastInsertRowid}，流程 ${input.workflowId}`);
  return { ok: true, data: result.lastInsertRowid };
}
export function toggleGuard(user: PublicUser, id: number, enabled: boolean): Result<number> {
  if (user.role !== "admin") return { ok: false, error: "只有管理员可以调整规则" };
  const result = sqlRun("UPDATE workflow_guards SET enabled = ? WHERE id = ?", enabled ? 1 : 0, id);
  if (!result.changes) return { ok: false, error: "规则不存在" };
  controlAudit(user, "guard.toggle", `规则 ${id}，${enabled ? "启用" : "停用"}`);
  return { ok: true, data: id };
}

const context = new AsyncLocalStorage<{ requestId: number; token: string }>();
export function assertApprovalLease(requestId: number) {
  const current = context.getStore();
  const row = sqlOne<{ token: string; expires_at: number }>("SELECT token, expires_at FROM approval_leases WHERE request_id = ?", requestId);
  if (!current || current.requestId !== requestId || row?.token !== current.token || row.expires_at < Date.now()) throw new Error("审批处理已超时，请刷新后重试");
}
export async function withApprovalLease<T>(requestId: number, fn: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  let acquired = false;
  for (let i = 0; i < 40; i++) {
    const now = Date.now();
    const result = sqlRun(`INSERT INTO approval_leases (request_id, token, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE approval_leases.expires_at < ?`, requestId, token, now + 120000, now);
    if (result.changes) { acquired = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!acquired) throw new Error("该单据正在处理，请稍后刷新");
  const heartbeat = setInterval(() => { sqlRun("UPDATE approval_leases SET expires_at = ? WHERE request_id = ? AND token = ?", Date.now() + 120000, requestId, token); }, 10000);
  heartbeat.unref();
  try { return await context.run({ requestId, token }, fn); }
  finally { clearInterval(heartbeat); sqlRun("DELETE FROM approval_leases WHERE request_id = ? AND token = ?", requestId, token); }
}
