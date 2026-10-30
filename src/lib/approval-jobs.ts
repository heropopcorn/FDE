import { sqlAll, sqlOne, sqlRun, withTransaction } from "@/lib/db";
import type { PublicUser, Result } from "@/lib/types";

export function listApprovalJobs() {
  return sqlAll<{ request_id: number; title: string; state: string; attempts: number; last_error: string; updated_at: string; running: number }>(`SELECT j.*, r.title,
    EXISTS(SELECT 1 FROM approval_leases l WHERE l.request_id = j.request_id AND l.expires_at >= ?) AS running
    FROM approval_jobs j JOIN requests r ON r.id = j.request_id WHERE j.state != 'done' ORDER BY j.updated_at LIMIT 30`, Date.now());
}

export function retryApprovalJob(user: PublicUser, requestId: number): Result<number> {
  if (user.role !== "admin") return { ok: false, error: "只有管理员可以恢复后台任务" };
  if (!Number.isSafeInteger(requestId) || requestId < 1) return { ok: false, error: "单号无效" };
  return withTransaction(() => {
    const job = sqlOne<{ state: string }>("SELECT state FROM approval_jobs WHERE request_id = ?", requestId);
    if (!job || job.state === "done") return { ok: false, error: "任务已完成或不存在，请刷新页面" };
    if (sqlOne("SELECT request_id FROM approval_leases WHERE request_id = ? AND expires_at >= ?", requestId, Date.now())) return { ok: false, error: "任务正在处理，请稍候" };
    enqueueApproval(requestId);
    sqlRun("INSERT INTO operation_audit (user_id, request_id, action, detail, created_at) VALUES (?, ?, 'job.retry', '重新加入后台恢复队列', ?)", user.id, requestId, new Date().toISOString());
    return { ok: true, data: requestId };
  });
}

export function enqueueApproval(requestId: number) {
  sqlRun(`INSERT INTO approval_jobs (request_id, updated_at) VALUES (?, ?)
    ON CONFLICT(request_id) DO UPDATE SET generation = generation + 1, state = 'queued', attempts = 0, retry_at = 0, last_error = '', updated_at = excluded.updated_at`, requestId, new Date().toISOString());
}

export async function drainApprovalJobs() {
  const jobs = sqlAll<{ request_id: number }>(`SELECT j.request_id FROM approval_jobs j
    WHERE j.state = 'queued' AND j.retry_at <= ?
    AND NOT EXISTS (SELECT 1 FROM approval_leases l WHERE l.request_id = j.request_id AND l.expires_at >= ?)
    ORDER BY j.updated_at LIMIT 4`, Date.now(), Date.now());
  const { resumeApprovalRequest } = await import("@/lib/service");
  for (const job of jobs) {
    try { await resumeApprovalRequest(job.request_id); }
    catch { /* The durable job retains its retry time and error for the next pass. */ }
  }
}

const workerGlobal = globalThis as unknown as { __approvalWorker?: ReturnType<typeof setInterval>; __approvalWorkerBusy?: boolean };
export function startApprovalWorker() {
  if (workerGlobal.__approvalWorker || process.env.APPROVAL_WORKER_DISABLED === "1") return;
  const tick = async () => {
    if (workerGlobal.__approvalWorkerBusy) return;
    workerGlobal.__approvalWorkerBusy = true;
    try { await drainApprovalJobs(); }
    catch (error) { console.error("审批任务恢复失败", error instanceof Error ? error.message : "未知错误"); }
    finally { workerGlobal.__approvalWorkerBusy = false; }
  };
  workerGlobal.__approvalWorker = setInterval(() => { void tick(); }, 10000);
  workerGlobal.__approvalWorker.unref();
  void tick();
}
