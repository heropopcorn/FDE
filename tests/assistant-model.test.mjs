import test from "node:test";
import assert from "node:assert/strict";
import { extractWithModel } from "../src/lib/assistant-parser.ts";

process.env.OPENROUTER_API_KEY = "private-test-key";
process.env.ASSISTANT_MODEL_ENABLED = "1";

const workflows = [{ id: 1, name: "请假审批", steps: [], fields: [
  { fieldKey: "days", label: "天数", fieldType: "number", required: true, options: [] },
  { fieldKey: "date", label: "开始日期", fieldType: "date", required: true, options: [] },
  { fieldKey: "kind", label: "类型", fieldType: "select", required: true, options: ["事假", "年假"] },
  { fieldKey: "phone", label: "手机号", fieldType: "text", required: false, options: [] },
] }];

function modelResponse(content) {
  return Response.json({ model: "test/model", choices: [{ message: { content } }] });
}

test("模型返回数字天数时保留结果，同时过滤越界字段和敏感字段", async t => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    const payload = JSON.parse(body.messages[1].content);
    assert.equal(payload.workflows[0].fields.some(f => f.key === "phone"), false);
    return modelResponse(JSON.stringify({ workflowId: 1, values: { days: 2, date: "2026-11-02", kind: "事假", phone: "13800138000", admin: "true" } }));
  });
  assert.deepEqual(await extractWithModel("课程测试", workflows), { workflowId: 1, values: { days: "2", date: "2026-11-02", kind: "事假" } });
});

test("不把无效天数、日期和选项写入草稿", async t => {
  t.mock.method(globalThis, "fetch", async () => modelResponse(JSON.stringify({ workflowId: 1, values: { days: -2, date: "2026-02-30", kind: "其他假" } })));
  assert.deepEqual(await extractWithModel("课程测试", workflows), { workflowId: 1, values: {} });
});

test("限流和损坏的返回可回退，日志不记录密钥或用户内容", async t => {
  const logs = [];
  t.mock.method(console, "warn", (...args) => logs.push(args));
  const replies = [new Response("rate limited", { status: 429 }), modelResponse("not valid JSON"), modelResponse('{"workflowId":1,"values":[]}')];
  t.mock.method(globalThis, "fetch", async () => replies.shift());
  for (let i = 0; i < 3; i++) assert.equal((await extractWithModel("private-user-input", workflows)).unavailable, true);
  assert.equal(logs.length, 3);
  assert.equal(JSON.parse(logs[0][1]).status, 429);
  assert.doesNotMatch(JSON.stringify(logs), /private-test-key|private-user-input|not valid JSON/);
});
