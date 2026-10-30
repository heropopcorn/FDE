import type { RequestStatus, WorkflowField } from "@/lib/types";

export type AssistantDraft = {
  workflowId: number;
  title: string;
  values: Record<string, string>;
  version: number;
  confirmationToken: string;
  schemaHash: string;
};
export type AssistantQuery = { scope: "mine" | "inbox"; workflowName?: string; status?: RequestStatus; page: number };
export type AssistantState = { draft?: AssistantDraft; lastRequestId?: number; query?: AssistantQuery };
export type AssistantRequest = {
  id: number;
  title: string;
  workflowName: string;
  status: RequestStatus;
  currentStepName: string | null;
  approvers: string[];
  updatedAt: string;
};
export type AssistantMessage = { id: number; role: "user" | "assistant"; text: string; requests?: AssistantRequest[]; createdAt: string };
export type AssistantView = {
  id: string;
  title: string;
  messages: AssistantMessage[];
  draft: (AssistantDraft & { workflowName: string; fields: WorkflowField[]; issues: string[]; ready: boolean }) | null;
};
export type ConversationItem = { id: string; title: string; updatedAt: string };
