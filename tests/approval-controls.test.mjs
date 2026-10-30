import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const directory = `.test-data-${randomUUID()}`;
process.env.DATA_DIR = directory;
process.env.SKIP_KB_INDEX = "1";
process.env.OPENROUTER_API_KEY = "test-only";
const { getDb, sqlRun, sqlOne } = await import("../src/lib/db.ts");
const { getUserByUsername, getRequestDetail } = await import("../src/lib/queries.ts");
const { submitRequest, decideRequest, retryAutomatic } = await import("../src/lib/service.ts");
const { approvalMode, setApprovalMode, addGuard, toggleGuard, evaluateGuards } = await import("../src/lib/approval-controls.ts");
const { judgeApplication } = await import("../src/lib/ai.ts");
const { captureKnowledgeVersion, isKnowledgeCurrent } = await import("../src/lib/knowledge-versions.ts");
const { drainApprovalJobs, retryApprovalJob } = await import("../src/lib/approval-jobs.ts");
getDb();
sqlRun("UPDATE ai_rules SET use_knowledge = 0");
const admin = getUserByUsername("admin"), member = getUserByUsername("qiujianfeng"), approver = getUserByUsername("zhangan");
const raw = { f1: "120", f2: "交通", f3: "2026-11-01", f4: "出差乘车费用" };
const originalFetch = globalThis.fetch;
let calls = 0;
const response = () => Response.json({ model: "test-model", choices: [{ message: { content: '{"decision":"approve","reason":"符合个人规则"}' } }] });
globalThis.fetch = async () => { calls++; return response(); };

test("成员不能切换模式，建议模式只记录建议，人工确认后推进", async () => {
  assert.equal(setApprovalMode(member, "paused").ok, false);
  assert.equal(setApprovalMode(admin, "suggestion").ok, true);
  const r = await submitRequest(member, 2, "建议模式测试", raw);
  assert.equal(r.ok, true);
  let d = getRequestDetail(r.data.id);
  assert.equal(d.currentStepOrder, 1); assert.equal(d.approvals.length, 0);
  assert.equal(d.attempts[0].outcome, "approve"); assert.match(d.attempts[0].reason, /等待审批人确认/);
  const decided = await decideRequest(approver, r.data.id, "approved", "核对通过");
  assert.equal(decided.ok, true);
  d = getRequestDetail(r.data.id); assert.equal(d.currentStepOrder, 2);
  assert.equal(d.approvals[0].source, "manual");
});

test("暂停模式不调用模型，执行期间暂停也不能自动通过", async () => {
  setApprovalMode(admin, "paused");
  let before = calls;
  const paused = await submitRequest(member, 2, "暂停测试", raw);
  assert.equal(calls, before); assert.equal(getRequestDetail(paused.data.id).approvals.length, 0);
  setApprovalMode(admin, "automatic");
  globalThis.fetch = async () => { calls++; setApprovalMode(admin, "paused"); return response(); };
  const interrupted = await submitRequest(member, 2, "执行期间暂停", raw);
  assert.equal(getRequestDetail(interrupted.data.id).approvals.length, 0);
  assert.match(getRequestDetail(interrupted.data.id).attempts[0].reason, /已暂停/);
  globalThis.fetch = async () => { calls++; return response(); };
});

test("硬规则优先于模型，停用后可重新判断，历史依据不删除", async () => {
  setApprovalMode(admin, "automatic");
  const guard = addGuard(admin, { workflowId: 2, fieldKey: "f1", operator: "gte", threshold: 100, reason: "达到人工复核额度" });
  assert.equal(guard.ok, true);
  const before = calls;
  const r = await submitRequest(member, 2, "数值门槛测试", raw);
  assert.equal(calls, before);
  assert.equal(getRequestDetail(r.data.id).approvals.length, 0);
  assert.match(getRequestDetail(r.data.id).attempts[0].reason, /命中数值规则/);
  assert.match(evaluateGuards(2, []), /无法校验/);
  assert.equal(toggleGuard(member, guard.data, false).ok, false);
  toggleGuard(admin, guard.data, false);
  assert.equal((await retryAutomatic(admin, r.data.id)).ok, true);
  assert.equal(getRequestDetail(r.data.id).approvals[0].source, "ai");
  assert.equal(sqlOne("SELECT COUNT(*) AS n FROM ai_evidence WHERE request_id = ?", r.data.id).n, 2);
});

test("制度缺失时直接转人工，敏感字段不发送给模型", async () => {
  let before = calls;
  const input = { rule: "通过", useKnowledge: true, knowledgeAvailable: false, knowledgeError: "test", knowledge: [], workflowName: "请假", stepName: "初审", title: "申请", form: [] };
  const unavailable = await judgeApplication(input);
  assert.equal(unavailable.decision, "manual"); assert.equal(calls, before);
  let sent = "";
  globalThis.fetch = async (_url, init) => { sent = init.body; return response(); };
  await judgeApplication({ ...input, useKnowledge: false, title: "联系13800138000", form: [{ key: "f1", label: "身份证", type: "text", value: "110101199001011234" }, { key: "f2", label: "说明", type: "text", value: "邮箱test@example.com" }] });
  assert.ok(!sent.includes("13800138000") && !sent.includes("110101199001011234") && !sent.includes("test@example.com"));
  globalThis.fetch = async () => { calls++; return response(); };
});

test("制度版本变化可检测，审计及判断快照只允许追加", () => {
  const doc = sqlOne("SELECT id, content FROM knowledge_docs LIMIT 1");
  const version = captureKnowledgeVersion(doc.id);
  assert.equal(isKnowledgeCurrent([{ docId: doc.id, version }]), true);
  sqlRun("UPDATE knowledge_docs SET content = ? WHERE id = ?", doc.content + "\n制度修订", doc.id);
  assert.equal(isKnowledgeCurrent([{ docId: doc.id, version }]), false);
  const next = captureKnowledgeVersion(doc.id); assert.notEqual(version, next);
  assert.throws(() => sqlRun("UPDATE operation_audit SET detail = 'change'"), /append-only/);
  assert.throws(() => sqlRun("DELETE FROM ai_evidence"), /append-only/);
  assert.throws(() => sqlRun("DELETE FROM knowledge_revisions"), /append-only/);
});

test("两个审批人同时处理或签节点只产生一次节点决定", async () => {
  setApprovalMode(admin, "paused");
  const r = await submitRequest(member, 1, "并发或签", { f1: "事假", f2: "2", f3: "2026-11-01", f4: "回家办理证件" });
  const outcomes = await Promise.all([decideRequest(getUserByUsername("shenjiaqi"), r.data.id, "approved", ""), decideRequest(getUserByUsername("changyi"), r.data.id, "approved", "")]);
  assert.equal(outcomes.filter(x => x.ok).length, 1);
  assert.equal(getRequestDetail(r.data.id).approvals.length, 1);
  assert.equal(approvalMode(), "paused");
});

test("无效单号返回明确提示，不触发数据库外键错误", async () => {
  for (const id of [NaN, -1, 999999]) {
    assert.equal((await decideRequest(approver, id, "approved", "")).ok, false);
    assert.equal((await retryAutomatic(admin, id)).ok, false);
  }
});

test("或签节点已人工通过时不再替另一人自动审批", async () => {
  setApprovalMode(admin, "paused");
  const r = await submitRequest(member, 1, "人工或签后检查", { f1: "事假", f2: "2", f3: "2026-11-01", f4: "回家办理证件" });
  const { saveRule } = await import("../src/lib/service.ts");
  saveRule(getUserByUsername("changyi").id, 1, "所有申请通过", true, false);
  saveRule(approver.id, 1, "", false, false);
  const before = calls;
  setApprovalMode(admin, "automatic");
  assert.equal((await decideRequest(getUserByUsername("shenjiaqi"), r.data.id, "approved", "已核对")).ok, true);
  assert.equal(calls, before);
  assert.equal(getRequestDetail(r.data.id).approvals.length, 1);
});

test("处理中断原子回滚，五次失败可由管理员恢复，新进程接续后不重复审批", async () => {
  setApprovalMode(admin, "automatic");
  getDb().exec("CREATE TEMP TRIGGER simulate_failure BEFORE INSERT ON ai_attempts BEGIN SELECT RAISE(ABORT, '模拟持久化中断'); END;");
  const r = await submitRequest(member, 2, "恢复队列测试", raw);
  assert.equal(r.ok, true);
  const id = r.data.id;
  assert.equal(getRequestDetail(id).approvals.length, 0);
  assert.equal(sqlOne("SELECT COUNT(*) AS n FROM ai_evidence WHERE request_id = ?", id).n, 0);
  for (let attempt = 1; attempt < 5; attempt++) {
    sqlRun("UPDATE approval_jobs SET retry_at = 0 WHERE request_id = ?", id);
    await drainApprovalJobs();
  }
  assert.equal(sqlOne("SELECT state FROM approval_jobs WHERE request_id = ?", id).state, "failed");
  assert.equal(retryApprovalJob(member, id).ok, false);
  assert.equal(retryApprovalJob(admin, id).ok, true);
  getDb().exec("DROP TRIGGER simulate_failure");
  execFileSync(process.execPath, ["--import", "./scripts/test-register.mjs", "--input-type=module", "-e", `
    globalThis.fetch = async () => Response.json({ model: 'test-model', choices: [{ message: { content: '{"decision":"approve","reason":"符合规则"}' } }] });
    await (await import('./src/lib/approval-jobs.ts')).drainApprovalJobs();
  `], { cwd: process.cwd(), env: process.env, stdio: "pipe" });
  assert.equal(sqlOne("SELECT state FROM approval_jobs WHERE request_id = ?", id).state, "done");
  assert.equal(getRequestDetail(id).approvals.length, 1);
  assert.equal(sqlOne("SELECT COUNT(*) AS n FROM ai_evidence WHERE request_id = ?", id).n, 1);
  await drainApprovalJobs();
  assert.equal(getRequestDetail(id).approvals.length, 1);
});

after(() => {
  globalThis.fetch = originalFetch;
  getDb().close();
  const target = path.resolve(directory);
  if (path.dirname(target) !== process.cwd() || !path.basename(target).startsWith(".test-data-")) throw new Error("Unsafe cleanup");
  fs.rmSync(target, { recursive: true, force: true });
});
