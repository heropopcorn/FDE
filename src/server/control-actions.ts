"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { addGuard, setApprovalMode, toggleGuard } from "@/lib/approval-controls";
import { retryApprovalJob } from "@/lib/approval-jobs";

function finish(error?: string): never {
  revalidatePath("/", "layout");
  redirect(`/admin/controls?${error ? `error=${encodeURIComponent(error)}` : "saved=1"}`);
}
export async function setModeAction(data: FormData) {
  const result = setApprovalMode(await requireAdmin(), String(data.get("mode") ?? ""));
  finish(result.ok ? undefined : result.error);
}
export async function addGuardAction(data: FormData) {
  const user = await requireAdmin();
  const [workflowId, fieldKey] = String(data.get("field") ?? "").split(":");
  const rawThreshold = String(data.get("threshold") ?? "").trim();
  const result = addGuard(user, { workflowId: Number(workflowId), fieldKey, operator: String(data.get("operator") ?? ""), threshold: rawThreshold ? Number(rawThreshold) : NaN, reason: String(data.get("reason") ?? "") });
  finish(result.ok ? undefined : result.error);
}
export async function toggleGuardAction(data: FormData) {
  const result = toggleGuard(await requireAdmin(), Number(data.get("id")), data.get("enabled") === "1");
  finish(result.ok ? undefined : result.error);
}
export async function retryJobAction(data: FormData) {
  const result = retryApprovalJob(await requireAdmin(), Number(data.get("requestId")));
  finish(result.ok ? undefined : result.error);
}
