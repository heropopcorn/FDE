"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { confirmAssistantDraft, conversationView, newConversation, sendAssistantMessage } from "@/lib/assistant";

export async function createConversationAction() {
  return newConversation(await getCurrentUser());
}
export async function loadConversationAction(id: string) {
  return conversationView(await getCurrentUser(), id);
}
export async function sendAssistantAction(input: { sessionId: string; message: string; commandKey: string; confirmationToken?: string }) {
  const result = await sendAssistantMessage(await getCurrentUser(), input);
  if (result.ok && !result.data.draft) revalidatePath("/", "layout");
  return result;
}
export async function confirmDraftAction(sessionId: string, confirmationToken: string, commandKey: string) {
  const result = await confirmAssistantDraft(await getCurrentUser(), sessionId, confirmationToken, commandKey);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
