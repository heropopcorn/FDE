import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = `.test-data-${randomUUID()}`;
process.env.DATA_DIR = directory;
process.env.SKIP_KB_INDEX = "1";
process.env.ASSISTANT_MODEL_ENABLED = "0";
const { getDb, sqlRun, sqlOne } = await import("../src/lib/db.ts");
const { getUserByUsername, getWorkflow, getRequestDetail, canViewRequest } = await import("../src/lib/queries.ts");
const { newConversation, sendAssistantMessage, confirmAssistantDraft, conversationView } = await import("../src/lib/assistant.ts");
const { submitRequest } = await import("../src/lib/service.ts");
const { extractDate, extractFields } = await import("../src/lib/assistant-parser.ts");
const { readAnswer } = await import("../src/lib/request-validation.ts");
const { redactSensitive } = await import("../src/lib/privacy.ts");
getDb();
sqlRun("UPDATE ai_rules SET enabled = 0");
const member = getUserByUsername("qiujianfeng");
const outsider = getUserByUsername("huangzunxuan");
const count = () => sqlOne("SELECT COUNT(*) AS n FROM requests").n;
async function send(user, sessionId, message, extras = {}) {
  const r = await sendAssistantMessage(user, { sessionId, message, commandKey: randomUUID(), ...extras });
  assert.equal(r.ok, true, r.error);
  return r.data;
}

test("自然语言补问、确认和重复确认只创建一张真实单据", async () => {
  const session = newConversation(member).data;
  const start = count();
  let view = await send(member, session.id, "我想请两天事假");
  assert.equal(view.draft.values.f1, "事假"); assert.equal(view.draft.values.f2, "2");
  assert.equal(view.draft.ready, false); assert.equal(count(), start);
  view = await send(member, session.id, "明天开始，事由：回家办理证件");
  assert.equal(view.draft.ready, true);
  const confirmation = view.draft.confirmationToken;
  const [a, b] = await Promise.all([confirmAssistantDraft(member, session.id, confirmation, randomUUID()), confirmAssistantDraft(member, session.id, confirmation, randomUUID())]);
  assert.ok(a.ok || b.ok); assert.equal(count(), start + 1);
  const finished = conversationView(member, session.id).data;
  const id = finished.messages.at(-1).requests[0].id;
  assert.equal(getRequestDetail(id).form.find(f => f.key === "f2").value, "2");
  assert.equal(finished.draft, null);
  assert.equal(sqlOne("SELECT state FROM approval_jobs WHERE request_id = ?", id).state, "queued");
  await confirmAssistantDraft(member, session.id, confirmation, randomUUID());
  assert.equal(count(), start + 1);
  assert.ok(sqlOne("SELECT id FROM operation_audit WHERE action = 'request.submit' AND request_id = ?", id));
});

test("旧草稿确认失效，取消草稿不提交", async () => {
  const session = newConversation(member).data;
  let view = await send(member, session.id, "明天请两天事假，事由：回家办理证件");
  const token = view.draft.confirmationToken;
  view = await send(member, session.id, "天数改为3");
  assert.equal(view.draft.values.f2, "3");
  const before = count();
  assert.equal((await confirmAssistantDraft(member, session.id, token, randomUUID())).ok, false);
  assert.equal(count(), before);
  view = await send(member, session.id, "取消草稿");
  assert.equal(view.draft, null); assert.equal(count(), before);
});

test("越权对话和单据查询不泄露信息，聊天不能代批", async () => {
  const session = newConversation(member).data;
  assert.equal(conversationView(outsider, session.id).ok, false);
  assert.equal((await sendAssistantMessage(outsider, { sessionId: session.id, message: "我的申请", commandKey: randomUUID() })).ok, false);
  const other = newConversation(outsider).data;
  const privateId = sqlOne("SELECT id FROM requests ORDER BY id DESC LIMIT 1").id;
  assert.equal(canViewRequest(outsider, privateId), false);
  let view = await send(outsider, other.id, `查看 #${privateId}`);
  assert.equal(view.messages.at(-1).requests.length, 0);
  assert.match(view.messages.at(-1).text, /没有找到可查看/);
  view = await send(outsider, other.id, "全部通过");
  assert.match(view.messages.at(-1).text, /详情页/);
});

test("查询返回数据库即时状态，同名多单不猜测", async () => {
  const session = newConversation(member).data;
  const id = sqlOne("SELECT id FROM requests ORDER BY id DESC LIMIT 1").id;
  const updated = "2026-10-30T09:00:00.000Z";
  sqlRun("UPDATE requests SET status = 'approved', current_step_order = NULL, updated_at = ? WHERE id = ?", updated, id);
  const view = await send(member, session.id, `查看 #${id}`);
  assert.equal(view.messages.at(-1).requests[0].status, "approved");
  assert.equal(view.messages.at(-1).requests[0].updatedAt, updated);
  const before = count();
  await send(member, session.id, "我的申请");
  assert.equal(count(), before);
});

test("消息重试幂等，缺字段不能确认，模型不可用仍保留草稿", async () => {
  const session = newConversation(member).data;
  const command = { sessionId: session.id, commandKey: randomUUID(), message: "我要报销交通费 120 元" };
  const a = await sendAssistantMessage(member, command);
  const b = await sendAssistantMessage(member, command);
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.equal(a.data.messages.length, b.data.messages.length);
  assert.equal((await confirmAssistantDraft(member, session.id, a.data.draft.confirmationToken, randomUUID())).ok, false);
  const view = await send(member, session.id, "继续看看");
  assert.equal(view.draft.workflowName, "费用报销");
  assert.equal(view.draft.values.f1, "120");
  assert.match(view.messages.at(-1).text, /草稿已保留/);
});

test("服务端校验真实日期、数值和选项，提交键不能复用不同参数", async () => {
  const workflow = getWorkflow(1);
  const dateField = workflow.fields.find(f => f.fieldType === "date");
  assert.equal(readAnswer(dateField, "2026-02-30").ok, false);
  assert.equal(extractFields("我要报销交通费 -120 元", getWorkflow(2)).values.f1, "-120");
  assert.equal(extractDate("明天", new Date("2026-10-30T20:00:00Z")), "2026-11-01");
  assert.equal((await submitRequest(member, 1, "不合法", { f1: "事假", f2: "-2", f3: "2026-11-01", f4: "原因具体" })).ok, false);
  const key = randomUUID(), raw = { f1: "事假", f2: "2", f3: "2026-11-01", f4: "回家办理证件" };
  const before = count();
  const a = await submitRequest(member, 1, "幂等测试", raw, key);
  const b = await submitRequest(member, 1, "幂等测试", raw, key);
  assert.equal(a.data.id, b.data.id); assert.equal(count(), before + 1);
  assert.equal((await submitRequest(member, 1, "幂等测试", { ...raw, f2: "4" }, key)).ok, false);
});

test("敏感信息脱敏与存量数据迁移保护", () => {
  const text = redactSensitive("手机13800138000，身份证110101199001011234 邮箱person@example.com 密码：not-real");
  assert.ok(!text.includes("13800138000") && !text.includes("110101199001011234") && !text.includes("person@example.com") && !text.includes("not-real"));
  const before = count();
  sqlRun("UPDATE app_meta SET value = 'old-version' WHERE key = 'data_version'");
  getDb(); assert.equal(count(), before);
});

after(() => {
  getDb().close();
  const target = path.resolve(directory);
  if (path.dirname(target) !== process.cwd() || !path.basename(target).startsWith(".test-data-")) throw new Error("Unsafe test cleanup path");
  fs.rmSync(target, { recursive: true, force: true });
});
