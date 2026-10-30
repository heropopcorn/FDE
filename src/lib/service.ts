import { judgeApplication } from "@/lib/ai";
import { nowIso } from "@/lib/format";
import { hashPassword } from "@/lib/password";
import { createHash } from "node:crypto";
import { sqlOne, sqlRun, withTransaction } from "@/lib/db";
import { validateRequest } from "@/lib/request-validation";
import { approvalMode, assertApprovalLease, evaluateGuards, withApprovalLease } from "@/lib/approval-controls";
import { redactSensitive } from "@/lib/privacy";
import { captureKnowledgeVersion, isKnowledgeCurrent } from "@/lib/knowledge-versions";
import { enqueueApproval } from "@/lib/approval-jobs";
import {
  countRequests,
  deleteKnowledgeDoc,
  deleteRetryableAttempts,
  getKnowledgeDoc,
  getRequestCore,
  getRule,
  getWorkflow,
  insertApproval,
  insertAttempt,
  insertKnowledgeDoc,
  insertLog,
  insertRequest,
  insertUser,
  insertWorkflow,
  listApprovals,
  listAttempts,
  listUserIds,
  markRequest,
  moveRequest,
  touchRequest,
  updateKnowledgeDoc,
  updateWorkflow,
  upsertRule,
} from "@/lib/queries";
import type {
  AiOutcome,
  FieldType,
  PublicUser,
  Result,
  Workflow,
  WorkflowInput,
  WorkflowStep,
} from "@/lib/types";

const fieldTypes = new Set<FieldType>(["text", "textarea", "number", "date", "select"]);
const locks = new Map<number, Promise<unknown>>();

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function withRequestLock<T>(requestId: number, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(requestId) ?? Promise.resolve();
  const execute = () => withApprovalLease(requestId, fn);
  const current = previous.then(execute, execute);
  locks.set(requestId, current);
  const cleanup = () => {
    if (locks.get(requestId) === current) locks.delete(requestId);
  };
  void current.then(cleanup, cleanup);
  return current;
}

export function createAccount(input: {
  username: string;
  displayName: string;
  password: string;
  role: "admin" | "member";
}): Result<{ id: number }> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(username)) {
    return fail("账号需以字母开头，3 到 20 位，只能包含小写字母、数字和下划线");
  }
  if (!displayName || displayName.length > 20) return fail("请填写 20 字以内的姓名");
  if (input.password.length < 6 || input.password.length > 64) return fail("密码长度需要在 6 到 64 位之间");
  if (input.role !== "admin" && input.role !== "member") return fail("角色不正确");

  try {
    const id = insertUser({
      username,
      displayName,
      passwordHash: hashPassword(input.password),
      role: input.role,
      createdAt: nowIso(),
    });
    return { ok: true, data: { id } };
  } catch (error) {
    if (String(error).includes("UNIQUE")) return fail("这个账号已经存在");
    throw error;
  }
}

function validateWorkflow(input: WorkflowInput): string | null {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > 40) return "请填写 40 字以内的流程名称";
  if (description.length > 500) return "说明不能超过 500 字";
  if (input.fields.length < 1 || input.fields.length > 12) return "表单字段需要 1 到 12 个";
  if (input.steps.length < 1 || input.steps.length > 8) return "审批节点需要 1 到 8 个";

  const labels = new Set<string>();
  for (const field of input.fields) {
    const label = field.label.trim();
    if (!label || label.length > 20) return "每个字段都要有 20 字以内的名称";
    if (labels.has(label)) return `字段「${label}」重复了`;
    labels.add(label);
    if (!fieldTypes.has(field.fieldType)) return "字段类型不正确";
    if (field.fieldType === "select") {
      const options = [...new Set(field.options.map((option) => option.trim()).filter(Boolean))];
      if (options.length < 2) return `「${label}」至少需要两个选项`;
      field.options = options;
    } else {
      field.options = [];
    }
  }

  const userIds = new Set(listUserIds());
  for (const step of input.steps) {
    const stepName = step.name.trim();
    if (!stepName || stepName.length > 20) return "每个节点都要有 20 字以内的名称";
    if (step.approveMode !== "any" && step.approveMode !== "all") return "审批方式不正确";
    const approvers = [...new Set(step.approverIds)];
    if (approvers.length < 1) return `「${stepName}」至少要指定一位审批人`;
    if (approvers.some((id) => !userIds.has(id))) return "审批人里有不存在的账号";
    step.approverIds = approvers;
  }
  return null;
}

export function saveWorkflow(actor: PublicUser, input: WorkflowInput): Result<{ id: number }> {
  if (actor.role !== "admin") return fail("只有管理员可以配置流程");
  const problem = validateWorkflow(input);
  if (problem) return fail(problem);
  const now = nowIso();

  if (!input.id) {
    const id = insertWorkflow(input, actor.id, now);
    return { ok: true, data: { id } };
  }

  const current = getWorkflow(input.id);
  if (!current) return fail("流程不存在");
  const locked = countRequests(input.id) > 0;
  updateWorkflow(input.id, input, now, !locked);
  return { ok: true, data: { id: input.id } };
}

export function saveRule(
  userId: number,
  workflowId: number,
  ruleText: string,
  enabled: boolean,
  useKnowledge: boolean,
): Result<{ id: number }> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) return fail("流程不存在");
  const text = ruleText.trim();
  if (text.length > 2000) return fail("规则不能超过 2000 字");
  if (enabled && !text) return fail("启用自动审批前，请先写清楚规则");
  upsertRule(userId, workflowId, enabled, useKnowledge, text, nowIso());
  return { ok: true, data: { id: workflowId } };
}

export async function saveKnowledge(
  userId: number,
  id: number | null,
  title: string,
  content: string,
): Promise<Result<{ id: number; warning: string }>> {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  if (!trimmedTitle || trimmedTitle.length > 40) return fail("请填写 40 字以内的规范名称");
  if (!trimmedContent) return fail("规范正文不能为空");
  if (trimmedContent.length > 20000) return fail("规范正文不能超过 20000 字");
  const now = nowIso();
  const docId = id
    ? (getKnowledgeDoc(id) ? id : null)
    : insertKnowledgeDoc(trimmedTitle, trimmedContent, userId, now);
  if (!docId) return fail("规范不存在");
  if (id) { captureKnowledgeVersion(docId); updateKnowledgeDoc(docId, trimmedTitle, trimmedContent, userId, now); }
  captureKnowledgeVersion(docId);
  try {
    const { reindexDocument } = await import("@/lib/vector-store");
    await reindexDocument(docId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "向量库写入失败";
    return { ok: true, data: { id: docId, warning: `正文已保存，但向量库写入失败：${message}` } };
  }
  return { ok: true, data: { id: docId, warning: "" } };
}

export async function removeKnowledge(id: number): Promise<Result<{ id: number }>> {
  const doc = getKnowledgeDoc(id);
  if (!doc) return fail("规范不存在");
  captureKnowledgeVersion(id);
  deleteKnowledgeDoc(id);
  try {
    const { removeDocumentVectors } = await import("@/lib/vector-store");
    await removeDocumentVectors(id);
  } catch {
    return { ok: true, data: { id } };
  }
  return { ok: true, data: { id } };
}

export async function submitRequest(
  user: PublicUser,
  workflowId: number,
  title: string,
  raw: Record<string, string>,
  submissionKey?: string,
  options: { waitForAutomatic?: boolean } = {},
): Promise<Result<{ id: number }>> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) return fail("流程不存在");
  const trimmedTitle = title.trim();
  const validated = validateRequest(workflow, title, raw);
  if (!validated.ok) return validated;
  const form = validated.data;
  if (submissionKey && !/^[a-zA-Z0-9:_-]{8,160}$/.test(submissionKey)) return fail("提交标识无效，请刷新后重试");
  const payloadHash = createHash("sha256").update(JSON.stringify({ workflowId, title: trimmedTitle, form })).digest("hex");

  const now = nowIso();
  const created = withTransaction((): Result<{ id: number; replay: boolean }> => {
    if (submissionKey) {
      const previous = sqlOne<{ request_id: number; payload_hash: string }>("SELECT request_id, payload_hash FROM request_submissions WHERE user_id = ? AND submission_key = ?", user.id, submissionKey);
      if (previous) return previous.payload_hash === payloadHash
        ? { ok: true, data: { id: previous.request_id, replay: true } }
        : fail("草稿已变更，请重新确认后提交");
    }
    const id = insertRequest({
    workflowId,
    title: trimmedTitle,
    form,
    initiatorId: user.id,
    currentStepOrder: workflow.steps[0].sortOrder,
    now,
    });
    if (submissionKey) sqlRun("INSERT INTO request_submissions (user_id, submission_key, payload_hash, request_id) VALUES (?, ?, ?, ?)", user.id, submissionKey, payloadHash, id);
    insertLog(id, `${user.displayName} 发起了申请`, now);
    enqueueApproval(id);
    return { ok: true, data: { id, replay: false } };
  });
  if (!created.ok) return created;
  const requestId = created.data.id;
  if (created.data.replay) return { ok: true, data: { id: requestId } };
  if (options.waitForAutomatic === false) return { ok: true, data: { id: requestId } };

  try {
    await resumeApprovalRequest(requestId);
  } catch (error) {
    insertLog(requestId, `自动审批中断：${error instanceof Error ? error.message : "未知错误"}`, nowIso());
  }
  return { ok: true, data: { id: requestId } };
}

export async function decideRequest(
  user: PublicUser,
  requestId: number,
  decision: "approved" | "rejected",
  comment: string,
): Promise<Result<{ id: number }>> {
  const note = comment.trim();
  if (!Number.isSafeInteger(requestId) || requestId < 1 || !getRequestCore(requestId)) return fail("申请不存在");
  if (decision !== "approved" && decision !== "rejected") return fail("审批决定不正确");
  if (note.length > 500) return fail("意见不能超过 500 字");
  if (decision === "rejected" && !note) return fail("驳回时请填写意见");

  return withRequestLock<Result<{ id: number }>>(requestId, async () => {
    const request = getRequestCore(requestId);
    if (!request) return fail("申请不存在");
    if (request.status !== "pending" || request.currentStepOrder == null) return fail("这份申请已经结束");
    const workflow = getWorkflow(request.workflowId);
    const step = workflow?.steps.find((item) => item.sortOrder === request.currentStepOrder);
    if (!step) return fail("当前节点不存在");
    if (!step.approvers.some((approver) => approver.id === user.id)) {
      return fail("现在还没轮到你审批，或这个节点已经结束");
    }

    const approvals = listApprovals(requestId).filter((item) => item.stepId === step.id);
    if (approvals.some((item) => item.approverId === user.id)) return fail("你已经处理过这个节点");
    if (step.approveMode === "any" && approvals.length > 0) return fail("这个节点已经有人处理");

    const now = nowIso();
    assertApprovalLease(requestId);
    try {
      withTransaction(() => {
      insertApproval({
        requestId,
        stepId: step.id,
        approverId: user.id,
        decision,
        comment: note,
        source: "manual",
        aiReason: "",
        now,
      });
      insertLog(requestId, note ? `${user.displayName} ${decision === "approved" ? "通过" : "驳回"}了审批：${note}` : `${user.displayName} 通过了审批`, now);
      enqueueApproval(requestId);
      });
    } catch (error) {
      if (String(error).includes("UNIQUE")) return fail("你已经处理过这个节点");
      throw error;
    }
    try { await settleTracked(requestId); }
    catch { insertLog(requestId, "审批意见已保存，后续处理进入恢复队列", nowIso()); }
    return { ok: true, data: { id: requestId } };
  }).catch(error => fail(error instanceof Error ? redactSensitive(error.message) : "处理暂时中断，请稍后重试"));
}

export async function retryAutomatic(user: PublicUser, requestId: number): Promise<Result<{ id: number }>> {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || !getRequestCore(requestId)) return fail("申请不存在");
  return withRequestLock<Result<{ id: number }>>(requestId, async () => {
    const request = getRequestCore(requestId);
    if (!request) return fail("申请不存在");
    if (request.status !== "pending" || request.currentStepOrder == null) return fail("这份申请已经结束");
    const workflow = getWorkflow(request.workflowId);
    const step = workflow?.steps.find((item) => item.sortOrder === request.currentStepOrder);
    if (!step) return fail("当前节点不存在");
    const involved =
      user.role === "admin" ||
      user.id === request.initiatorId ||
      step.approvers.some((approver) => approver.id === user.id);
    if (!involved) return fail("你不能重试这份申请的自动审批");

    withTransaction(() => {
      deleteRetryableAttempts(requestId, step.id);
      insertLog(requestId, `${user.displayName} 按最新规则重新判断当前节点`, nowIso());
      enqueueApproval(requestId);
    });
    await settleTracked(requestId);
    return { ok: true, data: { id: requestId } };
  }).catch(error => fail(error instanceof Error ? redactSensitive(error.message) : "处理暂时中断，请稍后重试"));
}

export function resumeApprovalRequest(requestId: number) {
  return withRequestLock(requestId, () => settleTracked(requestId));
}

async function settleTracked(requestId: number) {
  const job = sqlOne<{ generation: number; attempts: number; state: string }>("SELECT generation, attempts, state FROM approval_jobs WHERE request_id = ?", requestId);
  if (!job || job.state !== "queued") return;
  try {
    await settle(requestId);
    assertApprovalLease(requestId);
    sqlRun("UPDATE approval_jobs SET state = 'done', last_error = '', updated_at = ? WHERE request_id = ? AND generation = ?", nowIso(), requestId, job.generation);
  } catch (error) {
    // A stale worker must not overwrite the current worker's result.
    assertApprovalLease(requestId);
    const attempts = job.attempts + 1;
    sqlRun("UPDATE approval_jobs SET state = ?, attempts = ?, retry_at = ?, last_error = ?, updated_at = ? WHERE request_id = ? AND generation = ?", attempts >= 5 ? "failed" : "queued", attempts, Date.now() + Math.min(300000, 10000 * 2 ** attempts), redactSensitive(error instanceof Error ? error.message : "处理失败").slice(0, 500), nowIso(), requestId, job.generation);
    throw error;
  }
}

async function settle(requestId: number) {
  for (let guard = 0; guard < 8; guard += 1) {
    const request = getRequestCore(requestId);
    if (!request || request.status !== "pending" || request.currentStepOrder == null) return;
    const workflow = getWorkflow(request.workflowId);
    if (!workflow) return;
    const step = workflow.steps.find((item) => item.sortOrder === request.currentStepOrder);
    if (!step) {
      finish(requestId, "approved");
      return;
    }

    await runAi(request, workflow, step);
    assertApprovalLease(requestId);
    const outcome = evaluate(requestId, step);
    if (outcome === "wait") return;
    if (outcome === "rejected") {
      finish(requestId, "rejected");
      return;
    }

    const next = workflow.steps.find((item) => item.sortOrder > step.sortOrder);
    if (!next) {
      finish(requestId, "approved");
      return;
    }
    const now = nowIso();
    moveRequest(requestId, next.sortOrder, now);
    insertLog(requestId, `进入节点「${next.name}」，等待 ${next.approvers.map((item) => item.displayName).join("、")}`, now);
  }
}

function finish(requestId: number, status: "approved" | "rejected") {
  const now = nowIso();
  markRequest(requestId, status, now);
  insertLog(requestId, status === "approved" ? "全部节点已通过" : "审批结束：已驳回", now);
}

function evaluate(requestId: number, step: WorkflowStep): "approved" | "rejected" | "wait" {
  const approvals = listApprovals(requestId).filter((item) => item.stepId === step.id);
  const approved = approvals.filter((item) => item.decision === "approved");
  const rejected = approvals.filter((item) => item.decision === "rejected");
  if (step.approveMode === "any") {
    if (approved.length > 0) return "approved";
    if (rejected.length > 0) return "rejected";
    return "wait";
  }
  if (rejected.length > 0) return "rejected";
  const approvedIds = new Set(approved.map((item) => item.approverId));
  return step.approvers.every((approver) => approvedIds.has(approver.id)) ? "approved" : "wait";
}

async function runAi(
  request: NonNullable<ReturnType<typeof getRequestCore>>,
  workflow: Workflow,
  step: WorkflowStep,
) {
  if (approvalMode() === "paused") return;
  const approvals = listApprovals(request.id).filter((item) => item.stepId === step.id);
  // A human may have already decided this node before the automatic pass starts.
  if (approvals.some(item => item.decision === "rejected") || (step.approveMode === "any" && approvals.length > 0)) return;
  const attempts = listAttempts(request.id).filter((item) => item.stepId === step.id);
  for (const approver of step.approvers) {
    if (approvals.some((item) => item.approverId === approver.id)) continue;
    if (attempts.some((item) => item.approverId === approver.id)) continue;
    const rule = getRule(approver.id, workflow.id);
    if (!rule || rule.enabled !== 1 || !rule.rule_text.trim()) continue;

    const guardReason = evaluateGuards(workflow.id, request.form);
    const formText = request.form.map((field) => `${field.label}：${field.value}`).join("\n");
    const knowledge = rule.use_knowledge === 1 && !guardReason
      ? await (await import("@/lib/vector-store")).searchKnowledge(`${workflow.name}\n${request.title}\n${formText}`)
      : { available: true, hits: [], error: "" };
    const judgement = guardReason ? { decision: "manual" as const, reason: guardReason, model: "", knowledgeRefs: "" } : await judgeApplication({
      rule: rule.rule_text,
      useKnowledge: rule.use_knowledge === 1,
      knowledgeAvailable: knowledge.available,
      knowledgeError: knowledge.error,
      knowledge: knowledge.hits,
      workflowName: workflow.name,
      stepName: step.name,
      title: request.title,
      form: request.form,
    });
    assertApprovalLease(request.id);
    const now = nowIso();
    const mode = approvalMode();
    const latestRule = getRule(approver.id, workflow.id);
    const currentRequest = getRequestCore(request.id);
    if (!currentRequest || currentRequest.status !== "pending" || currentRequest.currentStepOrder !== step.sortOrder) return;
    const lateGuard = evaluateGuards(workflow.id, request.form);
    let outcome: AiOutcome = judgement.decision;
    let reason = judgement.reason;
    if (mode === "paused") { outcome = "manual"; reason = "自动审批已暂停，请人工处理"; }
    else if (!latestRule || latestRule.enabled !== 1 || latestRule.rule_text !== rule.rule_text || latestRule.use_knowledge !== rule.use_knowledge) { outcome = "manual"; reason = "个人规则在判断期间发生变化，请重新判断或人工处理"; }
    else if (lateGuard) { outcome = "manual"; reason = lateGuard; }
    else if (!isKnowledgeCurrent(knowledge.hits)) { outcome = "manual"; reason = "引用制度在判断期间发生变化，请重新判断或人工确认"; }
    const automatic = mode === "automatic" && (outcome === "approve" || outcome === "reject");
    if (mode === "suggestion" && (outcome === "approve" || outcome === "reject")) reason = `建议${outcome === "approve" ? "通过" : "驳回"}，等待审批人确认：${reason}`;
    withTransaction(() => {
    sqlRun("INSERT INTO ai_evidence (request_id, step_id, approver_id, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)", request.id, step.id, approver.id, JSON.stringify({ rule: rule.rule_text, ruleVersion: createHash("sha256").update(rule.rule_text).digest("hex"), formHash: createHash("sha256").update(JSON.stringify(request.form)).digest("hex"), knowledge: knowledge.hits, mode, outcome, reason, model: judgement.model, automatic }), now);
    insertAttempt({
      requestId: request.id,
      stepId: step.id,
      approverId: approver.id,
      outcome,
      reason,
      model: judgement.model,
      knowledgeRefs: judgement.knowledgeRefs,
      now,
    });

    const reference = judgement.knowledgeRefs ? `，参考了《${judgement.knowledgeRefs.replaceAll("、", "》《")}》` : "";
    if (automatic) {
      insertApproval({
        requestId: request.id,
        stepId: step.id,
        approverId: approver.id,
        decision: outcome === "approve" ? "approved" : "rejected",
        comment: "",
        source: "ai",
        aiReason: reason,
        now,
      });
      const verb = outcome === "approve" ? "自动通过" : "自动驳回";
      const model = judgement.model ? `（${judgement.model}）` : "";
      insertLog(request.id, `AI 按「${approver.displayName}」的规则${verb}${reference}${model}：${reason}`, now);
    } else if (outcome === "manual") {
      insertLog(request.id, `「${approver.displayName}」的规则未自动处理${reference}：${reason}`, now);
    } else if (mode === "suggestion" && (outcome === "approve" || outcome === "reject")) {
      insertLog(request.id, `「${approver.displayName}」收到 AI 建议${reference}：${reason}`, now);
    } else {
      insertLog(request.id, `调用 AI 失败（${approver.displayName}）：${redactSensitive(reason)}`, now);
    }
    touchRequest(request.id, now);
    });
    if (automatic && step.approveMode === "any") return;
  }
}
