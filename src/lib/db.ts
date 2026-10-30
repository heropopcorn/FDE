import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SqlValue } from "node:sqlite";
import { hashPassword } from "@/lib/password";
import { builtinKnowledge } from "@/lib/knowledge-docs";
import { ensureFeatureSchema } from "@/lib/feature-schema";

type Database = InstanceType<typeof DatabaseSync>;

const globalForDb = globalThis as unknown as { __approvalDb?: Database };

export type SqlParam = string | number | null;

function dataDirName() {
  const requested = process.env.DATA_DIR?.trim();
  if (!requested || requested.includes("..") || requested.includes("/") || requested.includes("\\")) return "data";
  return requested;
}

export function getDb() {
  if (!globalForDb.__approvalDb) {
    const dir = path.join(/* turbopackIgnore: true */ process.cwd(), dataDirName());
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "app.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    migrate(db);
    globalForDb.__approvalDb = db;
  }
  ensureDemoData(globalForDb.__approvalDb);
  ensureKnowledgeSchema(globalForDb.__approvalDb);
  ensureFeatureSchema(globalForDb.__approvalDb);
  return globalForDb.__approvalDb;
}

export function sqlOne<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function sqlAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function sqlRun(sql: string, ...params: SqlParam[]) {
  const result = getDb().prepare(sql).run(...(params as SqlValue[]));
  return {
    lastInsertRowid: Number(result.lastInsertRowid),
    changes: Number(result.changes),
  };
}

export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The original error is the one worth surfacing.
    }
    throw error;
  }
}

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_fields (
      id INTEGER PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_type TEXT NOT NULL CHECK(field_type IN ('text', 'textarea', 'number', 'date', 'select')),
      required INTEGER NOT NULL DEFAULT 1,
      options_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id INTEGER PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      approve_mode TEXT NOT NULL CHECK(approve_mode IN ('any', 'all')),
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_step_approvers (
      step_id INTEGER NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (step_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflows(id),
      title TEXT NOT NULL,
      form_json TEXT NOT NULL,
      initiator_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
      current_step_order INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      step_id INTEGER NOT NULL REFERENCES workflow_steps(id),
      approver_id INTEGER NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected')),
      comment TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL CHECK(source IN ('manual', 'ai')),
      ai_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(request_id, step_id, approver_id)
    );

    CREATE TABLE IF NOT EXISTS ai_rules (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      rule_text TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, workflow_id)
    );

    CREATE TABLE IF NOT EXISTS ai_attempts (
      id INTEGER PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      step_id INTEGER NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
      approver_id INTEGER NOT NULL REFERENCES users(id),
      outcome TEXT NOT NULL CHECK(outcome IN ('approve', 'reject', 'manual', 'error')),
      reason TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(request_id, step_id, approver_id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

type SeedField = {
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  options?: string[];
};

type SeedStep = {
  name: string;
  mode: "any" | "all";
  approvers: string[];
};

type SeedRule = {
  username: string;
  text: string;
};

const DATA_VERSION = "4";

function ensureDemoData(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  const current = db.prepare("SELECT value FROM app_meta WHERE key = 'data_version'").get() as
    | { value: string }
    | undefined;
  if (current?.value === DATA_VERSION) return;

  // Data-version changes must never erase user accounts or submitted requests.
  const users = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (Number(users.count) > 0) {
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('data_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(DATA_VERSION);
    return;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    seed(db);
    db.prepare(
      "INSERT INTO app_meta (key, value) VALUES ('data_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(DATA_VERSION);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Keep the original error.
    }
    throw error;
  }
}

let knowledgeIndexScheduled = false;

function ensureKnowledgeSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id)
    );
  `);
  addColumn(db, "ai_rules", "use_knowledge", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "ai_attempts", "knowledge_refs", "TEXT NOT NULL DEFAULT ''");

  const count = db.prepare("SELECT COUNT(*) AS c FROM knowledge_docs").get() as { c: number | bigint };
  if (Number(count.c) === 0) {
    const now = new Date().toISOString();
    const admin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number } | undefined;
    const insert = db.prepare(
      "INSERT INTO knowledge_docs (title, content, updated_at, updated_by) VALUES (?, ?, ?, ?)",
    );
    for (const doc of builtinKnowledge) {
      insert.run(doc.title, doc.content, now, admin?.id ?? null);
    }
  }

  const seeded = db.prepare("SELECT value FROM app_meta WHERE key = 'knowledge_switch'").get() as
    | { value: string }
    | undefined;
  if (!seeded) {
    db.prepare(
      `UPDATE ai_rules
       SET use_knowledge = 1
       WHERE user_id = (SELECT id FROM users WHERE username = 'zhangan')
         AND workflow_id = (SELECT id FROM workflows WHERE name = '请假审批')`,
    ).run();
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('knowledge_switch', '1')").run();
  }

  if (!knowledgeIndexScheduled && process.env.SKIP_KB_INDEX !== "1") {
    knowledgeIndexScheduled = true;
    void import("@/lib/vector-store")
      .then((store) => store.reindexAll())
      .catch(() => {
        knowledgeIndexScheduled = false;
      });
  }
}

function addColumn(db: Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seed(db: Database) {
  const now = new Date().toISOString();
  const memberPassword = hashPassword("123456");
  const insertUser = db.prepare(
    "INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  const ids = new Map<string, number>();
  const addUser = (username: string, displayName: string, passwordHash: string, role: "admin" | "member") => {
    ids.set(username, Number(insertUser.run(username, displayName, passwordHash, role, now).lastInsertRowid));
  };

  addUser("admin", "系统管理员", hashPassword("admin123"), "admin");
  addUser("zhangan", "张安", memberPassword, "member");
  addUser("qiujianfeng", "邱剑锋", memberPassword, "member");
  addUser("shenjiaqi", "申佳琪", memberPassword, "member");
  addUser("changyi", "常嫕", memberPassword, "member");
  addUser("huangzunxuan", "黄尊宣", memberPassword, "member");

  const adminId = ids.get("admin")!;
  const insertWorkflow = db.prepare(
    "INSERT INTO workflows (name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertField = db.prepare(
    "INSERT INTO workflow_fields (workflow_id, label, field_key, field_type, required, options_json, sort_order) VALUES (?, ?, ?, ?, 1, ?, ?)",
  );
  const insertStep = db.prepare(
    "INSERT INTO workflow_steps (workflow_id, name, approve_mode, sort_order) VALUES (?, ?, ?, ?)",
  );
  const insertApprover = db.prepare(
    "INSERT INTO workflow_step_approvers (step_id, user_id) VALUES (?, ?)",
  );
  const insertRule = db.prepare(
    "INSERT INTO ai_rules (user_id, workflow_id, enabled, rule_text, updated_at) VALUES (?, ?, 1, ?, ?)",
  );

  const addWorkflow = (name: string, description: string, fields: SeedField[], steps: SeedStep[], rules: SeedRule[]) => {
    const workflowId = Number(insertWorkflow.run(name, description, adminId, now, now).lastInsertRowid);
    fields.forEach((field, index) => {
      insertField.run(
        workflowId,
        field.label,
        `f${index + 1}`,
        field.type,
        JSON.stringify(field.options ?? []),
        index + 1,
      );
    });
    steps.forEach((step, index) => {
      const stepId = Number(insertStep.run(workflowId, step.name, step.mode, index + 1).lastInsertRowid);
      for (const username of step.approvers) {
        insertApprover.run(stepId, ids.get(username)!);
      }
    });
    for (const rule of rules) {
      insertRule.run(ids.get(rule.username)!, workflowId, rule.text, now);
    }
  };

  addWorkflow(
    "请假审批",
    "申佳琪或常嫕初审，其中一人通过即可。然后由张安复审。",
    [
      { label: "请假类型", type: "select", options: ["年假", "事假", "病假", "调休"] },
      { label: "天数", type: "number" },
      { label: "开始日期", type: "date" },
      { label: "事由", type: "textarea" },
    ],
    [
      { name: "初审", mode: "any", approvers: ["shenjiaqi", "changyi"] },
      { name: "复审", mode: "any", approvers: ["zhangan"] },
    ],
    [
      {
        username: "zhangan",
        text: "如果「天数」小于 3，直接通过。天数大于或等于 3 时不要拒绝，转人工审批。",
      },
    ],
  );

  addWorkflow(
    "费用报销",
    "张安初审，邱剑锋复审。",
    [
      { label: "报销金额", type: "number" },
      { label: "费用类型", type: "select", options: ["交通", "餐饮", "住宿", "其他"] },
      { label: "发生日期", type: "date" },
      { label: "说明", type: "textarea" },
    ],
    [
      { name: "初审", mode: "any", approvers: ["zhangan"] },
      { name: "复审", mode: "any", approvers: ["qiujianfeng"] },
    ],
    [
      {
        username: "zhangan",
        text: "如果「报销金额」小于 200，直接通过；否则转人工审批，不要拒绝。",
      },
    ],
  );

  addWorkflow(
    "服务器申请",
    "黄尊宣初审，常嫕复审。",
    [
      { label: "用途", type: "select", options: ["开发测试", "演示环境", "数据处理"] },
      { label: "使用天数", type: "number" },
      { label: "开始日期", type: "date" },
      { label: "配置说明", type: "textarea" },
    ],
    [
      { name: "初审", mode: "any", approvers: ["huangzunxuan"] },
      { name: "复审", mode: "any", approvers: ["changyi"] },
    ],
    [],
  );

  addWorkflow(
    "宣发活动申请",
    "邱剑锋初审，申佳琪复审。",
    [
      { label: "活动名称", type: "text" },
      { label: "活动日期", type: "date" },
      { label: "预算金额", type: "number" },
      { label: "活动说明", type: "textarea" },
    ],
    [
      { name: "初审", mode: "any", approvers: ["qiujianfeng"] },
      { name: "复审", mode: "any", approvers: ["shenjiaqi"] },
    ],
    [],
  );

  addWorkflow(
    "技术支持",
    "常嫕初审，黄尊宣复审。",
    [
      { label: "支持主题", type: "text" },
      { label: "紧急程度", type: "select", options: ["普通", "紧急"] },
      { label: "期望完成日期", type: "date" },
      { label: "问题描述", type: "textarea" },
    ],
    [
      { name: "初审", mode: "any", approvers: ["changyi"] },
      { name: "复审", mode: "any", approvers: ["huangzunxuan"] },
    ],
    [],
  );
}
