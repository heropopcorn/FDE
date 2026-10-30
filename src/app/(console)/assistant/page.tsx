import { getCurrentUser } from "@/lib/auth";
import { conversationView, listConversations } from "@/lib/assistant";
import { listWorkflowBoards } from "@/lib/queries";
import { AssistantWorkspace } from "@/components/assistant-workspace";

export const metadata = { title: "审批助手" };

export default async function AssistantPage() {
  const user = await getCurrentUser();
  const conversations = listConversations(user);
  const latest = conversations.length ? conversationView(user, conversations[0].id) : null;
  return <AssistantWorkspace initialView={latest?.ok ? latest.data : null} conversations={conversations} displayName={user.displayName} workflows={listWorkflowBoards().map(w => ({ id: w.id, name: w.name }))} />;
}
