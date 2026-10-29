export type Role = "admin" | "member";
export type FieldType = "text" | "textarea" | "number" | "date" | "select";
export type ApproveMode = "any" | "all";
export type RequestStatus = "pending" | "approved" | "rejected";
export type Decision = "approved" | "rejected";
export type DecisionSource = "manual" | "ai";
export type AiOutcome = "approve" | "reject" | "manual" | "error";

export type PublicUser = {
  id: number;
  username: string;
  displayName: string;
  role: Role;
};

export type FormAnswer = {
  key: string;
  label: string;
  type: FieldType;
  value: string;
};

export type WorkflowField = {
  id: number;
  label: string;
  fieldKey: string;
  fieldType: FieldType;
  required: boolean;
  options: string[];
  sortOrder: number;
};

export type WorkflowStep = {
  id: number;
  name: string;
  approveMode: ApproveMode;
  sortOrder: number;
  approvers: { id: number; displayName: string }[];
};

export type Workflow = {
  id: number;
  name: string;
  description: string;
  fields: WorkflowField[];
  steps: WorkflowStep[];
};

export type WorkflowInput = {
  id?: number;
  name: string;
  description: string;
  fields: {
    label: string;
    fieldType: FieldType;
    required: boolean;
    options: string[];
  }[];
  steps: {
    name: string;
    approveMode: ApproveMode;
    approverIds: number[];
  }[];
};

export type WorkflowBoard = {
  id: number;
  name: string;
  description: string;
  fieldLabels: string[];
  steps: { name: string; approveMode: ApproveMode; approverNames: string[] }[];
  rules: { approverName: string; ruleText: string }[];
  locked: boolean;
};

export type RequestListItem = {
  id: number;
  title: string;
  workflowName: string;
  status: RequestStatus;
  initiatorName: string;
  currentStepName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalRecord = {
  stepId: number;
  approverId: number;
  approverName: string;
  decision: Decision;
  comment: string;
  source: DecisionSource;
  aiReason: string;
  createdAt: string;
};

export type AiAttemptRecord = {
  stepId: number;
  approverId: number;
  outcome: AiOutcome;
  reason: string;
  model: string;
  knowledgeRefs: string;
  createdAt: string;
};

export type StepView = {
  id: number;
  name: string;
  approveMode: ApproveMode;
  sortOrder: number;
  approvers: {
    id: number;
    displayName: string;
    ruleEnabled: boolean;
    ruleText: string;
  }[];
};

export type RequestDetail = {
  id: number;
  workflowId: number;
  workflowName: string;
  workflowDescription: string;
  title: string;
  form: FormAnswer[];
  initiatorId: number;
  initiatorName: string;
  status: RequestStatus;
  currentStepOrder: number | null;
  createdAt: string;
  updatedAt: string;
  steps: StepView[];
  approvals: ApprovalRecord[];
  attempts: AiAttemptRecord[];
  logs: { message: string; createdAt: string }[];
};

export type AiRule = {
  workflowId: number;
  workflowName: string;
  enabled: boolean;
  useKnowledge: boolean;
  ruleText: string;
  updatedAt: string | null;
  approver: boolean;
};

export type KnowledgeDoc = {
  id: number;
  title: string;
  content: string;
  updatedAt: string;
};

export type DashboardStats = {
  inbox: number;
  minePending: number;
  aiApprovals: number;
  finished: number;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
