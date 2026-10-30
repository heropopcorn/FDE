"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authenticate, clearSession, getCurrentUser, requireAdmin } from "@/lib/auth";
import { createAccount, decideRequest, removeKnowledge, retryAutomatic, saveKnowledge, saveRule, saveWorkflow, submitRequest } from "@/lib/service";
import type { WorkflowInput } from "@/lib/types";

function refresh() {
  revalidatePath("/", "layout");
}

function bounce(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}

export async function login(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const user = await authenticate(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""));
  if (!user) return { error: "账号或密码不正确" };
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function createUserAction(formData: FormData) {
  await requireAdmin();
  const role = String(formData.get("role") ?? "member") === "admin" ? "admin" : "member";
  const result = createAccount({
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    password: String(formData.get("password") ?? ""),
    role,
  });
  if (!result.ok) bounce("/admin/users", result.error);
  refresh();
  redirect("/admin/users?saved=1");
}

export async function saveWorkflowAction(input: WorkflowInput) {
  const user = await requireAdmin();
  const result = saveWorkflow(user, input);
  if (result.ok) refresh();
  return result;
}

export async function startRequestAction(formData: FormData) {
  const user = await getCurrentUser();
  const workflowId = Number(formData.get("workflowId"));
  const raw: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field:") && typeof value === "string") raw[key.slice(6)] = value;
  }
  const key = String(formData.get("submissionKey") ?? "");
  if (!key) bounce(`/start/${workflowId || ""}`, "表单已过期，请刷新后重新填写");
  const result = await submitRequest(user, workflowId, String(formData.get("title") ?? ""), raw, `form:${key}`);
  if (!result.ok) bounce(`/start/${workflowId || ""}`, result.error);
  refresh();
  redirect(`/requests/${result.data.id}`);
}

export async function decideAction(formData: FormData) {
  const user = await getCurrentUser();
  const requestId = Number(formData.get("requestId"));
  const decision = String(formData.get("decision"));
  const back = `/requests/${requestId || ""}`;
  if (decision !== "approved" && decision !== "rejected") bounce(back, "审批决定不正确");
  const result = await decideRequest(user, requestId, decision, String(formData.get("comment") ?? ""));
  if (!result.ok) bounce(back, result.error);
  refresh();
  redirect(back);
}

export async function retryAction(formData: FormData) {
  const user = await getCurrentUser();
  const requestId = Number(formData.get("requestId"));
  const result = await retryAutomatic(user, requestId);
  const back = `/requests/${requestId || ""}`;
  if (!result.ok) bounce(back, result.error);
  refresh();
  redirect(back);
}

export async function saveRuleAction(formData: FormData) {
  const user = await getCurrentUser();
  const workflowId = Number(formData.get("workflowId"));
  const result = saveRule(
    user.id,
    workflowId,
    String(formData.get("ruleText") ?? ""),
    formData.get("enabled") === "1",
    formData.get("useKnowledge") === "1",
  );
  if (!result.ok) bounce("/rules", result.error);
  refresh();
  redirect(`/rules?saved=${workflowId}`);
}

export async function saveKnowledgeAction(formData: FormData) {
  const user = await requireAdmin();
  const idValue = Number(formData.get("id") || 0);
  let title = String(formData.get("title") ?? "");
  let content = String(formData.get("content") ?? "");
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".txt") && !name.endsWith(".md")) {
      bounce(idValue ? `/admin/knowledge/${idValue}` : "/admin/knowledge/new", "只支持上传 txt 或 md 文件");
    }
    if (file.size > 200_000) {
      bounce(idValue ? `/admin/knowledge/${idValue}` : "/admin/knowledge/new", "文件不能超过 200KB");
    }
    const uploaded = (await file.text()).replace(/^\uFEFF/, "");
    if (uploaded.trim()) content = uploaded;
    if (!title.trim()) title = file.name.replace(/\.(txt|md)$/i, "");
  }
  const result = await saveKnowledge(user.id, idValue || null, title, content);
  const back = idValue ? `/admin/knowledge/${idValue}` : "/admin/knowledge/new";
  if (!result.ok) bounce(back, result.error);
  refresh();
  if (result.data.warning) bounce(`/admin/knowledge/${result.data.id}`, result.data.warning);
  redirect(`/admin/knowledge/${result.data.id}?saved=1`);
}

export async function deleteKnowledgeAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const result = await removeKnowledge(id);
  if (!result.ok) bounce("/admin/knowledge", result.error);
  refresh();
  redirect("/admin/knowledge?deleted=1");
}

export async function reindexKnowledgeAction() {
  await requireAdmin();
  try {
    const { reindexAll } = await import("@/lib/vector-store");
    await reindexAll();
  } catch (error) {
    bounce("/admin/knowledge", error instanceof Error ? error.message : "向量库写入失败");
  }
  refresh();
  redirect("/admin/knowledge?indexed=1");
}
