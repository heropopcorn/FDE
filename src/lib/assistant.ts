import { createHash, randomUUID } from "node:crypto";
import { sqlAll, sqlOne, sqlRun, withTransaction } from "@/lib/db";
import { canViewRequest, getRequestDetail, getWorkflow, listInbox, listMine, listWorkflowBoards } from "@/lib/queries";
import { submitRequest } from "@/lib/service";
import { readAnswer } from "@/lib/request-validation";
import { extractFields, extractWithModel, findWorkflow, queryIntent } from "@/lib/assistant-parser";
import { statusLabel } from "@/lib/format";
import type { AssistantDraft, AssistantMessage, AssistantQuery, AssistantRequest, AssistantState, AssistantView, ConversationItem } from "@/lib/assistant-types";
import type { PublicUser, Result, Workflow } from "@/lib/types";

type Session = { id: string; user_id: number; title: string; state_json: string; lock_token: string | null };
const bad = (error: string): Result<never> => ({ ok: false, error });
const idValid = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9:_-]{8,100}$/.test(id);
const schemaHash = (w: Workflow) => createHash("sha256").update(JSON.stringify({ fields: w.fields, steps: w.steps })).digest("hex");
function allWorkflows() { return listWorkflowBoards().map(w => getWorkflow(w.id)).filter((w): w is Workflow => w !== null); }
function getSession(user: PublicUser, id: string) { return sqlOne<Session>("SELECT * FROM assistant_sessions WHERE id = ? AND user_id = ?", id, user.id); }
export function audit(userId: number, action: string, detail = "", sessionId: string | null = null, requestId: number | null = null) {
  sqlRun("INSERT INTO operation_audit (user_id, session_id, request_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)", userId, sessionId, requestId, action, detail.slice(0, 500), new Date().toISOString());
}
export function listConversations(user: PublicUser): ConversationItem[] {
  return sqlAll<{ id: string; title: string; updated_at: string }>("SELECT id, title, updated_at FROM assistant_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30", user.id).map(r => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}
export function conversationView(user: PublicUser, id: string): Result<AssistantView> {
  if (!idValid(id)) return bad("对话不存在或无权查看");
  const session = getSession(user, id);
  if (!session) return bad("对话不存在或无权查看");
  const state = JSON.parse(session.state_json) as AssistantState;
  const rows = sqlAll<{ id: number; role: "user" | "assistant"; payload_json: string; created_at: string }>("SELECT id, role, payload_json, created_at FROM assistant_messages WHERE session_id = ? ORDER BY id DESC LIMIT 60", id).reverse();
  const messages: AssistantMessage[] = rows.map(row => {
    const payload = JSON.parse(row.payload_json) as { text: string; requests?: AssistantRequest[] };
    const requests = payload.requests?.filter(r => canViewRequest(user, r.id));
    return { id: row.id, role: row.role, text: requests?.length !== payload.requests?.length ? "可访问的单据范围已变化，请重新查询。" : payload.text, requests, createdAt: row.created_at };
  });
  let draft: AssistantView["draft"] = null;
  if (state.draft) {
    const workflow = getWorkflow(state.draft.workflowId);
    if (workflow) {
      const issues = workflow.fields.map(f => readAnswer(f, state.draft!.values[f.fieldKey] ?? "")).flatMap(r => r.ok ? [] : [r.error]);
      if (schemaHash(workflow) !== state.draft.schemaHash) issues.unshift("流程配置已更新，请在对话中重新整理草稿");
      draft = { ...state.draft, workflowName: workflow.name, fields: workflow.fields, issues, ready: issues.length === 0 };
    }
  }
  return { ok: true, data: { id, title: session.title, messages, draft } };
}
export function newConversation(user: PublicUser): Result<AssistantView> {
  const now = new Date().toISOString(), id = randomUUID();
  sqlRun("INSERT INTO assistant_sessions (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)", id, user.id, now, now);
  return conversationView(user, id);
}
function lockSession(user: PublicUser, id: string): string | null {
  const token = randomUUID(), now = Date.now();
  const result = sqlRun("UPDATE assistant_sessions SET lock_token = ?, lock_until = ? WHERE id = ? AND user_id = ? AND (lock_token IS NULL OR lock_until < ?)", token, now + 180000, id, user.id, now);
  return result.changes ? token : null;
}
function release(id: string, token: string) { sqlRun("UPDATE assistant_sessions SET lock_token = NULL, lock_until = 0 WHERE id = ? AND lock_token = ?", id, token); }
function completed(id: string, key: string) { return !!sqlOne("SELECT id FROM assistant_messages WHERE session_id = ? AND command_key = ? AND role = 'assistant'", id, key); }
function saveTurn(user: PublicUser, session: Session, token: string, key: string, input: string, text: string, state: AssistantState, requests?: AssistantRequest[]) {
  withTransaction(() => {
    const now = new Date().toISOString();
    const updated = sqlRun("UPDATE assistant_sessions SET state_json = ?, title = ?, updated_at = ? WHERE id = ? AND user_id = ? AND lock_token = ?", JSON.stringify(state), session.title === "新对话" ? input.slice(0, 24) : session.title, now, session.id, user.id, token);
    if (!updated.changes) throw new Error("对话已更新，请刷新后重试");
    for (const [role, payload] of [["user", { text: input }], ["assistant", { text, requests }]] as const) sqlRun("INSERT INTO assistant_messages (session_id, command_key, role, payload_json, created_at) VALUES (?, ?, ?, ?, ?)", session.id, key, role, JSON.stringify(payload), now);
  });
}
function requestCard(user: PublicUser, id: number): AssistantRequest | null {
  if (!canViewRequest(user, id)) return null;
  const detail = getRequestDetail(id);
  if (!detail) return null;
  const step = detail.steps.find(s => s.sortOrder === detail.currentStepOrder);
  return { id, title: detail.title, workflowName: detail.workflowName, status: detail.status, currentStepName: step?.name ?? null, approvers: step?.approvers.filter(a => !detail.approvals.some(ap => ap.stepId === step.id && ap.approverId === a.id)).map(a => a.displayName) ?? [], updatedAt: detail.updatedAt };
}
function queryRequests(user: PublicUser, query: AssistantQuery & { requestId?: number }) {
  if (query.requestId) {
    const card = requestCard(user, query.requestId);
    if (!card) return { text: "没有找到可查看的单据。请核对编号，或查询“我的申请”。", requests: [] };
    return { text: `单据 #${card.id} 当前${statusLabel(card.status)}。${card.currentStepName ? `正在「${card.currentStepName}」，${card.approvers.length ? `等待 ${card.approvers.join("、")} 处理。` : "等待节点流转。"}` : "流程已结束。"}`, requests: [card] };
  }
  const items = (query.scope === "inbox" ? listInbox(user.id) : listMine(user.id)).filter(r => (!query.workflowName || r.workflowName === query.workflowName) && (!query.status || r.status === query.status));
  const page = items.slice(query.page * 8, (query.page + 1) * 8);
  const requests = page.map(r => requestCard(user, r.id)).filter((r): r is AssistantRequest => r !== null);
  const prefix = query.scope === "inbox" ? "待你处理的审批" : "你发起的申请";
  return { text: !items.length ? `没有找到符合条件的${prefix}。` : !requests.length ? "已经显示完全部记录了。" : `${prefix}共 ${items.length} 项，当前显示第 ${query.page * 8 + 1}–${query.page * 8 + requests.length} 项。${items.length > 1 ? "可点击单据查看，或发送“查看 #单号”查询具体进度。" : ""}${items.length > (query.page + 1) * 8 ? "发送“下一页”继续查看。" : ""}`, requests };
}

export async function sendAssistantMessage(user: PublicUser, input: { sessionId: string; message: string; commandKey: string; confirmationToken?: string }): Promise<Result<AssistantView>> {
  if (!input || !idValid(input.sessionId) || !idValid(input.commandKey) || typeof input.message !== "string" || !input.message.trim() || input.message.length > 2000) return bad("请输入 1–2000 字的内容");
  const session = getSession(user, input.sessionId);
  if (!session) return bad("对话不存在或无权查看");
  if (completed(session.id, input.commandKey)) return conversationView(user, session.id);
  const message = input.message.trim();
  if (/^(确认提交|确定提交|提交申请|确认发起)[。！!\s]*$/.test(message)) return confirmAssistantDraft(user, session.id, input.confirmationToken ?? "", input.commandKey);
  const token = lockSession(user, session.id);
  if (!token) return bad("上一条消息正在处理中，请稍后重试");
  try {
    // Read again after acquiring the lease so another tab cannot overwrite a newer draft.
    if (completed(session.id, input.commandKey)) return conversationView(user, session.id);
    const latest = getSession(user, session.id)!;
    const state = JSON.parse(latest.state_json) as AssistantState;
    const workflows = allWorkflows();
    let text: string, requests: AssistantRequest[] | undefined;
    const query = queryIntent(message, workflows, state.query);
    if (/^(取消|取消草稿|放弃|不提交|取消申请)[。！!\s]*$/.test(message)) {
      delete state.draft;
      text = "草稿已取消，没有创建新的申请。你可以继续查询进度或发起另一份申请。";
      audit(user.id, "draft.cancel", "", session.id);
    } else if (/^(通过|批准|驳回|拒绝).*(申请|单据|#|号)|^(全部通过|同意审批)/.test(message)) {
      text = "审批决定需要在单据详情页由当前审批人确认。你可以先说“我的待办”，找到需要处理的单据。";
    } else if (query) {
      const result = queryRequests(user, query);
      text = result.text; requests = result.requests;
      if (!query.requestId) state.query = query;
      audit(user.id, "request.query", query.requestId ? `单号 ${query.requestId}，返回 ${requests.length} 项` : `范围 ${query.scope}，返回 ${requests.length} 项`, session.id);
    } else {
      let workflow = findWorkflow(message, workflows) ?? workflows.find(w => w.id === state.draft?.workflowId);
      const previous = workflow?.id === state.draft?.workflowId ? state.draft : undefined;
      let extracted = workflow ? extractFields(message, workflow, previous) : { values: {} as Record<string, string>, title: undefined as string | undefined };
      let unavailable = false;
      if (!workflow || (!Object.keys(extracted.values).length && !extracted.title && !/^(我要|帮我|发起|申请)/.test(message))) {
        const model = await extractWithModel(message, workflows, previous);
        unavailable = !!model.unavailable;
        workflow = workflows.find(w => w.id === model.workflowId) ?? workflow;
        if (workflow) extracted = { values: { ...model.values, ...extractFields(message, workflow, workflow.id === previous?.workflowId ? previous : undefined).values }, title: extracted.title };
      }
      if (!workflow) {
        text = `可以通过对话发起 ${workflows.map(w => w.name).join("、")}，也可以查询“我的申请”“我的待办”或“查看 #单号”。请告诉我你要办理哪类事项。${unavailable ? "也可以直接填写流程名称和字段，我会继续整理。" : ""}`;
      } else {
        const same = workflow.id === state.draft?.workflowId ? state.draft : undefined;
        const values = { ...(same?.values ?? {}), ...extracted.values };
        // Drop fields removed by a configuration update.
        for (const key of Object.keys(values)) if (!workflow.fields.some(f => f.fieldKey === key)) delete values[key];
        const draft: AssistantDraft = { workflowId: workflow.id, title: extracted.title || same?.title || workflow.name, values, version: (state.draft?.version ?? 0) + 1, confirmationToken: randomUUID(), schemaHash: schemaHash(workflow) };
        state.draft = draft;
        const issues = workflow.fields.map(f => ({ field: f, result: readAnswer(f, values[f.fieldKey] ?? "") })).filter(r => !r.result.ok);
        if (issues.length) {
          const next = issues[0];
          text = `正在整理「${workflow.name}」申请。${next.result.ok ? "" : next.result.error}。${next.field.options.length ? `可选：${next.field.options.join("、")}。` : ""}${issues.length > 1 ? `还需补充：${issues.slice(1).map(r => r.field.label).join("、")}。` : ""}你也可以一次补充多个字段。`;
        } else {
          text = `「${workflow.name}」草稿已整理好，请核对草稿卡片，尤其是日期和数值。点击“确认并提交”，或回复“确认提交”后才会创建申请。需要调整时直接说“字段名改为新值”。`;
        }
        if (unavailable) text += " 当前智能解析暂不可用，你仍可按字段名称继续填写，草稿已保留。";
        audit(user.id, "draft.update", `流程 ${workflow.id}，版本 ${draft.version}`, session.id);
      }
    }
    saveTurn(user, latest, token, input.commandKey, message, text, state, requests);
    return conversationView(user, session.id);
  } catch {
    return bad("本次处理没有完成，草稿仍然保留。请重试或使用表单填写。");
  } finally { release(session.id, token); }
}

export async function confirmAssistantDraft(user: PublicUser, sessionId: string, confirmationToken: string, commandKey: string): Promise<Result<AssistantView>> {
  if (!idValid(sessionId) || !idValid(commandKey) || !idValid(confirmationToken)) return bad("请先核对完整草稿，再点击确认提交");
  if (!getSession(user, sessionId)) return bad("对话不存在或无权查看");
  if (completed(sessionId, commandKey)) return conversationView(user, sessionId);
  const token = lockSession(user, sessionId);
  if (!token) return bad("申请正在处理中，请稍后刷新对话查看结果");
  try {
    const session = getSession(user, sessionId)!;
    const state = JSON.parse(session.state_json) as AssistantState;
    const draft = state.draft;
    if (!draft) return state.lastRequestId ? conversationView(user, sessionId) : bad("没有可提交的草稿");
    if (confirmationToken !== draft.confirmationToken) return bad("草稿已修改，请重新查看并确认最新版本");
    const workflow = getWorkflow(draft.workflowId);
    if (!workflow || schemaHash(workflow) !== draft.schemaHash) return bad("流程配置已更新，请在对话中重新整理草稿后提交");
    const result = await submitRequest(user, draft.workflowId, draft.title, draft.values, `chat:${sessionId}:${draft.confirmationToken}`, { waitForAutomatic: false });
    if (!result.ok) return result;
    const id = result.data.id;
    state.lastRequestId = id;
    delete state.draft;
    const card = requestCard(user, id);
    saveTurn(user, session, token, commandKey, "确认提交", `申请已创建，单号 #${id}。${card?.currentStepName ? `当前进入「${card.currentStepName}」。` : "请查看单据详情。"}你可以继续询问进度。`, state, card ? [card] : []);
    audit(user.id, "request.submit", `草稿版本 ${draft.version}`, sessionId, id);
    return conversationView(user, sessionId);
  } catch { return bad("提交结果暂未返回，请重试确认；同一草稿不会重复创建申请。"); }
  finally { release(sessionId, token); }
}
