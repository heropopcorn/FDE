import { sqlAll, sqlOne, sqlRun, withTransaction, type SqlParam } from "@/lib/db";
import type {
  AiAttemptRecord,
  AiOutcome,
  ApprovalRecord,
  ApproveMode,
  DashboardStats,
  Decision,
  DecisionSource,
  FieldType,
  FormAnswer,
  PublicUser,
  RequestListItem,
  RequestStatus,
  Role,
  Workflow,
  WorkflowBoard,
  WorkflowField,
  WorkflowInput,
  WorkflowStep,
  AiRule,
  RequestDetail,
} from "@/lib/types";

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  password_hash?: string;
  role: Role;
  created_at?: string;
  expires_at?: string;
};

export type UserAccount = PublicUser & { createdAt: string };
export type LoginUser = PublicUser & { passwordHash: string };

function userFrom(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
}

export function getUserByUsername(username: string): LoginUser | null {
  const row = sqlOne<UserRow>(
    "SELECT id, username, display_name, password_hash, role FROM users WHERE username = ?",
    username,
  );
  if (!row?.password_hash) return null;
  return { ...userFrom(row), passwordHash: row.password_hash };
}

export function getUserById(id: number): PublicUser | null {
  const row = sqlOne<UserRow>("SELECT id, username, display_name, role FROM users WHERE id = ?", id);
  return row ? userFrom(row) : null;
}

export function getUserBySession(sessionId: string): (PublicUser & { expiresAt: string }) | null {
  const row = sqlOne<UserRow>(
    `SELECT u.id, u.username, u.display_name, u.role, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    sessionId,
  );
  if (!row?.expires_at) return null;
  return { ...userFrom(row), expiresAt: row.expires_at };
}

export function listUsers(): UserAccount[] {
  return sqlAll<UserRow>(
    "SELECT id, username, display_name, role, created_at FROM users ORDER BY id",
  ).map((row) => ({ ...userFrom(row), createdAt: row.created_at ?? "" }));
}

export function listUserIds(): number[] {
  return sqlAll<{ id: number }>("SELECT id FROM users").map((row) => row.id);
}

export function insertSession(id: string, userId: number, expiresAt: string) {
  sqlRun("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", id, userId, expiresAt);
}

export function deleteSession(id: string) {
  sqlRun("DELETE FROM sessions WHERE id = ?", id);
}

export function deleteExpiredSessions(now: string) {
  sqlRun("DELETE FROM sessions WHERE expires_at <= ?", now);
}

export function insertUser(input: {
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}) {
  return sqlRun(
    "INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    input.username,
    input.displayName,
    input.passwordHash,
    input.role,
    input.createdAt,
  ).lastInsertRowid;
}

type FieldRow = {
  id: number;
  workflow_id: number;
  label: string;
  field_key: string;
  field_type: FieldType;
  required: number;
  options_json: string;
  sort_order: number;
};

type StepRow = {
  id: number;
  workflow_id: number;
  name: string;
  approve_mode: ApproveMode;
  sort_order: number;
  user_id: number | null;
  display_name: string | null;
};

function parseOptions(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseForm(json: string): FormAnswer[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Partial<FormAnswer>;
      if (!row.key || !row.label || !row.type) return [];
      return [{ key: row.key, label: row.label, type: row.type, value: String(row.value ?? "") }];
    });
  } catch {
    return [];
  }
}

function loadSteps(workflowId: number): WorkflowStep[] {
  const rows = sqlAll<StepRow>(
    `SELECT s.id, s.workflow_id, s.name, s.approve_mode, s.sort_order, u.id AS user_id, u.display_name
     FROM workflow_steps s
     LEFT JOIN workflow_step_approvers a ON a.step_id = s.id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE s.workflow_id = ?
     ORDER BY s.sort_order, u.id`,
    workflowId,
  );
  const steps: WorkflowStep[] = [];
  for (const row of rows) {
    let step = steps.find((item) => item.id === row.id);
    if (!step) {
      step = {
        id: row.id,
        name: row.name,
        approveMode: row.approve_mode,
        sortOrder: row.sort_order,
        approvers: [],
      };
      steps.push(step);
    }
    if (row.user_id && row.display_name) {
      step.approvers.push({ id: row.user_id, displayName: row.display_name });
    }
  }
  return steps;
}

function loadFields(workflowId: number): WorkflowField[] {
  return sqlAll<FieldRow>(
    `SELECT id, workflow_id, label, field_key, field_type, required, options_json, sort_order
     FROM workflow_fields WHERE workflow_id = ? ORDER BY sort_order`,
    workflowId,
  ).map((row) => ({
    id: row.id,
    label: row.label,
    fieldKey: row.field_key,
    fieldType: row.field_type,
    required: row.required === 1,
    options: parseOptions(row.options_json),
    sortOrder: row.sort_order,
  }));
}

export function getWorkflow(id: number): Workflow | null {
  const row = sqlOne<{ id: number; name: string; description: string }>(
    "SELECT id, name, description FROM workflows WHERE id = ?",
    id,
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: loadFields(id),
    steps: loadSteps(id),
  };
}

export function countRequests(workflowId: number) {
  const row = sqlOne<{ c: number | bigint }>("SELECT COUNT(*) AS c FROM requests WHERE workflow_id = ?", workflowId);
  return Number(row?.c ?? 0);
}

export function listWorkflowBoards(): WorkflowBoard[] {
  const workflows = sqlAll<{ id: number; name: string; description: string }>(
    "SELECT id, name, description FROM workflows ORDER BY id",
  );
  return workflows.map((workflow) => {
    const fields = loadFields(workflow.id);
    const steps = loadSteps(workflow.id);
    const rules = sqlAll<{ display_name: string; rule_text: string }>(
      `SELECT u.display_name, r.rule_text
       FROM ai_rules r JOIN users u ON u.id = r.user_id
       WHERE r.workflow_id = ? AND r.enabled = 1 AND TRIM(r.rule_text) != ''
       ORDER BY u.id`,
      workflow.id,
    );
    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      fieldLabels: fields.map((field) => field.label),
      steps: steps.map((step) => ({
        name: step.name,
        approveMode: step.approveMode,
        approverNames: step.approvers.map((approver) => approver.displayName),
      })),
      rules: rules.map((rule) => ({ approverName: rule.display_name, ruleText: rule.rule_text })),
      locked: countRequests(workflow.id) > 0,
    };
  });
}

function writeStructure(workflowId: number, input: WorkflowInput) {
  sqlRun(
    `DELETE FROM workflow_step_approvers
     WHERE step_id IN (SELECT id FROM workflow_steps WHERE workflow_id = ?)`,
    workflowId,
  );
  sqlRun("DELETE FROM workflow_steps WHERE workflow_id = ?", workflowId);
  sqlRun("DELETE FROM workflow_fields WHERE workflow_id = ?", workflowId);

  input.fields.forEach((field, index) => {
    sqlRun(
      `INSERT INTO workflow_fields
        (workflow_id, label, field_key, field_type, required, options_json, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      workflowId,
      field.label.trim(),
      `f${index + 1}`,
      field.fieldType,
      field.required ? 1 : 0,
      JSON.stringify(field.fieldType === "select" ? field.options : []),
      index + 1,
    );
  });

  input.steps.forEach((step, index) => {
    const stepId = sqlRun(
      "INSERT INTO workflow_steps (workflow_id, name, approve_mode, sort_order) VALUES (?, ?, ?, ?)",
      workflowId,
      step.name.trim(),
      step.approveMode,
      index + 1,
    ).lastInsertRowid;
    for (const userId of step.approverIds) {
      sqlRun("INSERT INTO workflow_step_approvers (step_id, user_id) VALUES (?, ?)", stepId, userId);
    }
  });
}

export function insertWorkflow(input: WorkflowInput, actorId: number, now: string) {
  return withTransaction(() => {
    const workflowId = sqlRun(
      "INSERT INTO workflows (name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      input.name.trim(),
      input.description.trim(),
      actorId,
      now,
      now,
    ).lastInsertRowid;
    writeStructure(workflowId, input);
    return workflowId;
  });
}

export function updateWorkflow(workflowId: number, input: WorkflowInput, now: string, replaceStructure: boolean) {
  withTransaction(() => {
    sqlRun(
      "UPDATE workflows SET name = ?, description = ?, updated_at = ? WHERE id = ?",
      input.name.trim(),
      input.description.trim(),
      now,
      workflowId,
    );
    if (replaceStructure) writeStructure(workflowId, input);
  });
}

type RequestRow = {
  id: number;
  workflow_id: number;
  workflow_name: string;
  workflow_description?: string;
  title: string;
  form_json: string;
  initiator_id: number;
  initiator_name: string;
  status: RequestStatus;
  current_step_order: number | null;
  created_at: string;
  updated_at: string;
  step_name: string | null;
};

const requestSelect = `
  SELECT r.id, r.workflow_id, w.name AS workflow_name, w.description AS workflow_description,
         r.title, r.form_json, r.initiator_id, u.display_name AS initiator_name,
         r.status, r.current_step_order, r.created_at, r.updated_at,
         s.name AS step_name
  FROM requests r
  JOIN workflows w ON w.id = r.workflow_id
  JOIN users u ON u.id = r.initiator_id
  LEFT JOIN workflow_steps s ON s.workflow_id = r.workflow_id AND s.sort_order = r.current_step_order
`;

function toListItem(row: RequestRow): RequestListItem {
  return {
    id: row.id,
    title: row.title,
    workflowName: row.workflow_name,
    status: row.status,
    initiatorName: row.initiator_name,
    currentStepName: row.step_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getRequestCore(id: number) {
  const row = sqlOne<RequestRow>(`${requestSelect} WHERE r.id = ?`, id);
  if (!row) return null;
  return {
    ...toListItem(row),
    workflowId: row.workflow_id,
    workflowDescription: row.workflow_description ?? "",
    form: parseForm(row.form_json),
    initiatorId: row.initiator_id,
    currentStepOrder: row.current_step_order,
  };
}

export function listInbox(userId: number): RequestListItem[] {
  return sqlAll<RequestRow>(
    `${requestSelect}
     JOIN workflow_step_approvers a ON a.step_id = s.id AND a.user_id = ?
     WHERE r.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM approvals ap
         WHERE ap.request_id = r.id AND ap.step_id = s.id AND ap.approver_id = ?
       )
     ORDER BY r.updated_at DESC`,
    userId,
    userId,
  ).map(toListItem);
}

export function listMine(userId: number): RequestListItem[] {
  return sqlAll<RequestRow>(`${requestSelect} WHERE r.initiator_id = ? ORDER BY r.updated_at DESC`, userId).map(toListItem);
}

export function listRecent(viewer: { id: number; role: Role }, limit: number): RequestListItem[] {
  if (viewer.role === "admin") {
    return sqlAll<RequestRow>(`${requestSelect} ORDER BY r.updated_at DESC LIMIT ?`, limit).map(toListItem);
  }
  const scope = visibleRequestSql("r");
  return sqlAll<RequestRow>(
    `${requestSelect} WHERE ${scope.sql} ORDER BY r.updated_at DESC LIMIT ?`,
    ...scope.params(viewer.id),
    limit,
  ).map(toListItem);
}

function visibleRequestSql(requestAlias: string) {
  return {
    sql: `(
      ${requestAlias}.initiator_id = ?
      OR EXISTS (
        SELECT 1
        FROM workflow_steps vs
        JOIN workflow_step_approvers va ON va.step_id = vs.id AND va.user_id = ?
        WHERE vs.workflow_id = ${requestAlias}.workflow_id
          AND (
            ${requestAlias}.status = 'approved'
            OR (
              ${requestAlias}.status = 'pending'
              AND ${requestAlias}.current_step_order IS NOT NULL
              AND vs.sort_order <= ${requestAlias}.current_step_order
            )
            OR (
              ${requestAlias}.status = 'rejected'
              AND vs.sort_order <= COALESCE((
                SELECT MAX(rs.sort_order)
                FROM approvals ap
                JOIN workflow_steps rs ON rs.id = ap.step_id
                WHERE ap.request_id = ${requestAlias}.id AND ap.decision = 'rejected'
              ), 0)
            )
          )
      )
    )`,
    params: (userId: number) => [userId, userId],
  };
}

export function canViewRequest(viewer: { id: number; role: Role }, requestId: number) {
  if (viewer.role === "admin") return getRequestCore(requestId) !== null;
  const scope = visibleRequestSql("r");
  const row = sqlOne<{ id: number }>(
    `SELECT r.id AS id FROM requests r WHERE r.id = ? AND ${scope.sql}`,
    requestId,
    ...scope.params(viewer.id),
  );
  return row !== undefined;
}

export function dashboardStats(viewer: { id: number; role: Role }): DashboardStats {
  const count = (sql: string, ...params: SqlParam[]) => Number(sqlOne<{ c: number | bigint }>(sql, ...params)?.c ?? 0);
  const inbox = count(
    `SELECT COUNT(*) AS c
     FROM requests r
     JOIN workflow_steps s ON s.workflow_id = r.workflow_id AND s.sort_order = r.current_step_order
     JOIN workflow_step_approvers a ON a.step_id = s.id AND a.user_id = ?
     WHERE r.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM approvals ap
         WHERE ap.request_id = r.id AND ap.step_id = s.id AND ap.approver_id = ?
       )`,
    viewer.id,
    viewer.id,
  );
  const minePending = count(
    "SELECT COUNT(*) AS c FROM requests WHERE initiator_id = ? AND status = 'pending'",
    viewer.id,
  );
  if (viewer.role === "admin") {
    return {
      inbox,
      minePending,
      aiApprovals: count("SELECT COUNT(*) AS c FROM approvals WHERE source = 'ai' AND decision = 'approved'"),
      finished: count("SELECT COUNT(*) AS c FROM requests WHERE status != 'pending'"),
    };
  }
  const scope = visibleRequestSql("r");
  return {
    inbox,
    minePending,
    aiApprovals: count(
      `SELECT COUNT(*) AS c
       FROM approvals ap
       JOIN requests r ON r.id = ap.request_id
       WHERE ap.source = 'ai' AND ap.decision = 'approved' AND ${scope.sql}`,
      ...scope.params(viewer.id),
    ),
    finished: count(
      `SELECT COUNT(*) AS c FROM requests r WHERE r.status != 'pending' AND ${scope.sql}`,
      ...scope.params(viewer.id),
    ),
  };
}

export type DashboardChartData = {
  days: { date: string; label: string; count: number }[];
  outcomes: { outcome: AiOutcome; count: number }[];
};

export function dashboardChartData(viewer: { id: number; role: Role }, now = new Date()): DashboardChartData {
  // Use Beijing calendar days independently of the server's timezone.
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dates = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(`${today}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() - 29 + index);
    return day.toISOString().slice(0, 10);
  });
  const scope = visibleRequestSql("r");
  const where = viewer.role === "admin" ? "1 = 1" : scope.sql;
  const params = viewer.role === "admin" ? [] : scope.params(viewer.id);
  const rows = sqlAll<{ day: string; c: number | bigint }>(
    `SELECT date(r.created_at, '+8 hours') AS day, COUNT(*) AS c
     FROM requests r
     WHERE ${where} AND date(r.created_at, '+8 hours') BETWEEN ? AND ?
     GROUP BY date(r.created_at, '+8 hours')`,
    ...params,
    dates[0],
    today,
  );
  const dayCounts = new Map(rows.map((row) => [row.day, Number(row.c)]));
  const attempts = sqlAll<{ outcome: AiOutcome; c: number | bigint }>(
    `SELECT a.outcome, COUNT(*) AS c
     FROM ai_attempts a JOIN requests r ON r.id = a.request_id
     WHERE ${where}
     GROUP BY a.outcome`,
    ...params,
  );
  const outcomeCounts = new Map(attempts.map((row) => [row.outcome, Number(row.c)]));
  return {
    days: dates.map((date) => ({ date, label: date.slice(5).replace("-", "/"), count: dayCounts.get(date) ?? 0 })),
    outcomes: (["approve", "reject", "manual", "error"] as const).map((outcome) => ({
      outcome,
      count: outcomeCounts.get(outcome) ?? 0,
    })),
  };
}

export function listApprovals(requestId: number): ApprovalRecord[] {
  return sqlAll<{
    step_id: number;
    approver_id: number;
    display_name: string;
    decision: Decision;
    comment: string;
    source: DecisionSource;
    ai_reason: string;
    created_at: string;
  }>(
    `SELECT a.step_id, a.approver_id, u.display_name, a.decision, a.comment, a.source, a.ai_reason, a.created_at
     FROM approvals a JOIN users u ON u.id = a.approver_id
     WHERE a.request_id = ?
     ORDER BY a.id`,
    requestId,
  ).map((row) => ({
    stepId: row.step_id,
    approverId: row.approver_id,
    approverName: row.display_name,
    decision: row.decision,
    comment: row.comment,
    source: row.source,
    aiReason: row.ai_reason,
    createdAt: row.created_at,
  }));
}

export function listAttempts(requestId: number): AiAttemptRecord[] {
  return sqlAll<{
    step_id: number;
    approver_id: number;
    outcome: AiOutcome;
    reason: string;
    model: string;
    knowledge_refs: string;
    created_at: string;
  }>(
    `SELECT step_id, approver_id, outcome, reason, model, knowledge_refs, created_at
     FROM ai_attempts WHERE request_id = ? ORDER BY id`,
    requestId,
  ).map((row) => ({
    stepId: row.step_id,
    approverId: row.approver_id,
    outcome: row.outcome,
    reason: row.reason,
    model: row.model,
    knowledgeRefs: row.knowledge_refs,
    createdAt: row.created_at,
  }));
}

export function listLogs(requestId: number) {
  return sqlAll<{ message: string; created_at: string }>(
    "SELECT message, created_at FROM activity_logs WHERE request_id = ? ORDER BY id",
    requestId,
  ).map((row) => ({ message: row.message, createdAt: row.created_at }));
}

export function listRulesForWorkflow(workflowId: number) {
  return sqlAll<{ user_id: number; enabled: number; use_knowledge: number; rule_text: string; display_name: string }>(
    `SELECT r.user_id, r.enabled, r.use_knowledge, r.rule_text, u.display_name
     FROM ai_rules r JOIN users u ON u.id = r.user_id
     WHERE r.workflow_id = ?`,
    workflowId,
  );
}

export function listRulesForUser(userId: number) {
  return sqlAll<{ workflow_id: number; enabled: number; use_knowledge: number; rule_text: string; updated_at: string }>(
    "SELECT workflow_id, enabled, use_knowledge, rule_text, updated_at FROM ai_rules WHERE user_id = ?",
    userId,
  );
}

export function getRule(userId: number, workflowId: number) {
  return sqlOne<{ enabled: number; use_knowledge: number; rule_text: string }>(
    "SELECT enabled, use_knowledge, rule_text FROM ai_rules WHERE user_id = ? AND workflow_id = ?",
    userId,
    workflowId,
  );
}

export function upsertRule(
  userId: number,
  workflowId: number,
  enabled: boolean,
  useKnowledge: boolean,
  ruleText: string,
  now: string,
) {
  sqlRun(
    `INSERT INTO ai_rules (user_id, workflow_id, enabled, use_knowledge, rule_text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, workflow_id)
     DO UPDATE SET enabled = excluded.enabled, use_knowledge = excluded.use_knowledge,
       rule_text = excluded.rule_text, updated_at = excluded.updated_at`,
    userId,
    workflowId,
    enabled ? 1 : 0,
    useKnowledge ? 1 : 0,
    ruleText.trim(),
    now,
  );
}

export function insertRequest(input: {
  workflowId: number;
  title: string;
  form: FormAnswer[];
  initiatorId: number;
  currentStepOrder: number;
  now: string;
}) {
  return sqlRun(
    `INSERT INTO requests
      (workflow_id, title, form_json, initiator_id, status, current_step_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    input.workflowId,
    input.title,
    JSON.stringify(input.form),
    input.initiatorId,
    input.currentStepOrder,
    input.now,
    input.now,
  ).lastInsertRowid;
}

export function insertApproval(input: {
  requestId: number;
  stepId: number;
  approverId: number;
  decision: Decision;
  comment: string;
  source: DecisionSource;
  aiReason: string;
  now: string;
}) {
  return sqlRun(
    `INSERT INTO approvals
      (request_id, step_id, approver_id, decision, comment, source, ai_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.requestId,
    input.stepId,
    input.approverId,
    input.decision,
    input.comment,
    input.source,
    input.aiReason,
    input.now,
  ).changes;
}

export function insertAttempt(input: {
  requestId: number;
  stepId: number;
  approverId: number;
  outcome: AiOutcome;
  reason: string;
  model: string;
  knowledgeRefs: string;
  now: string;
}) {
  sqlRun(
    `INSERT INTO ai_attempts
      (request_id, step_id, approver_id, outcome, reason, model, knowledge_refs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.requestId,
    input.stepId,
    input.approverId,
    input.outcome,
    input.reason,
    input.model,
    input.knowledgeRefs,
    input.now,
  );
}

export function deleteRetryableAttempts(requestId: number, stepId: number) {
  sqlRun(
    `DELETE FROM ai_attempts
     WHERE request_id = ? AND step_id = ?
       AND approver_id NOT IN (
         SELECT approver_id FROM approvals WHERE request_id = ? AND step_id = ?
       )`,
    requestId,
    stepId,
    requestId,
    stepId,
  );
}

export function markRequest(id: number, status: "approved" | "rejected", now: string) {
  sqlRun(
    "UPDATE requests SET status = ?, current_step_order = NULL, updated_at = ? WHERE id = ?",
    status,
    now,
    id,
  );
}

export function moveRequest(id: number, stepOrder: number, now: string) {
  sqlRun("UPDATE requests SET current_step_order = ?, updated_at = ? WHERE id = ?", stepOrder, now, id);
}

export function touchRequest(id: number, now: string) {
  sqlRun("UPDATE requests SET updated_at = ? WHERE id = ?", now, id);
}

export function insertLog(requestId: number, message: string, now: string) {
  sqlRun("INSERT INTO activity_logs (request_id, message, created_at) VALUES (?, ?, ?)", requestId, message, now);
}

export function listAiRules(userId: number): AiRule[] {
  const workflows = sqlAll<{ id: number; name: string }>("SELECT id, name FROM workflows ORDER BY id");
  const own = new Map(listRulesForUser(userId).map((rule) => [rule.workflow_id, rule]));
  return workflows.map((workflow) => {
    const rule = own.get(workflow.id);
    const assigned = sqlOne<{ c: number | bigint }>(
      `SELECT COUNT(*) AS c
       FROM workflow_steps s
       JOIN workflow_step_approvers a ON a.step_id = s.id
       WHERE s.workflow_id = ? AND a.user_id = ?`,
      workflow.id,
      userId,
    );
    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      enabled: rule?.enabled === 1,
      useKnowledge: rule?.use_knowledge === 1,
      ruleText: rule?.rule_text ?? "",
      updatedAt: rule?.updated_at ?? null,
      approver: Number(assigned?.c ?? 0) > 0,
    };
  });
}

export function getRequestDetail(id: number): RequestDetail | null {
  const core = getRequestCore(id);
  if (!core) return null;
  const workflow = getWorkflow(core.workflowId);
  if (!workflow) return null;
  const rules = new Map(listRulesForWorkflow(core.workflowId).map((rule) => [rule.user_id, rule]));
  return {
    id: core.id,
    workflowId: core.workflowId,
    workflowName: core.workflowName,
    workflowDescription: core.workflowDescription,
    title: core.title,
    form: core.form,
    initiatorId: core.initiatorId,
    initiatorName: core.initiatorName,
    status: core.status,
    currentStepOrder: core.currentStepOrder,
    createdAt: core.createdAt,
    updatedAt: core.updatedAt,
    steps: workflow.steps.map((step) => ({
      ...step,
      approvers: step.approvers.map((approver) => {
        const rule = rules.get(approver.id);
        return {
          id: approver.id,
          displayName: approver.displayName,
          ruleEnabled: rule?.enabled === 1 && Boolean(rule.rule_text.trim()),
          ruleText: rule?.rule_text ?? "",
        };
      }),
    })),
    approvals: listApprovals(id),
    attempts: listAttempts(id),
    logs: listLogs(id),
  };
}

export function listKnowledgeDocs() {
  return sqlAll<{ id: number; title: string; content: string; updated_at: string }>(
    "SELECT id, title, content, updated_at FROM knowledge_docs ORDER BY id",
  ).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at,
  }));
}

export function getKnowledgeDoc(id: number) {
  const row = sqlOne<{ id: number; title: string; content: string; updated_at: string }>(
    "SELECT id, title, content, updated_at FROM knowledge_docs WHERE id = ?",
    id,
  );
  if (!row) return null;
  return { id: row.id, title: row.title, content: row.content, updatedAt: row.updated_at };
}

export function insertKnowledgeDoc(title: string, content: string, userId: number, now: string) {
  return sqlRun(
    "INSERT INTO knowledge_docs (title, content, updated_at, updated_by) VALUES (?, ?, ?, ?)",
    title,
    content,
    now,
    userId,
  ).lastInsertRowid;
}

export function updateKnowledgeDoc(id: number, title: string, content: string, userId: number, now: string) {
  sqlRun(
    "UPDATE knowledge_docs SET title = ?, content = ?, updated_at = ?, updated_by = ? WHERE id = ?",
    title,
    content,
    now,
    userId,
    id,
  );
}

export function deleteKnowledgeDoc(id: number) {
  sqlRun("DELETE FROM knowledge_docs WHERE id = ?", id);
}
