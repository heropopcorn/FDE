import type { DatabaseSync } from "node:sqlite";

let initialized: DatabaseSync | undefined;

export function ensureFeatureSchema(db: DatabaseSync) {
  if (initialized === db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_submissions (
      user_id INTEGER NOT NULL REFERENCES users(id),
      submission_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      PRIMARY KEY (user_id, submission_key)
    );
    CREATE TABLE IF NOT EXISTS assistant_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL DEFAULT '新对话',
      state_json TEXT NOT NULL DEFAULT '{}',
      lock_token TEXT,
      lock_until INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assistant_sessions_owner ON assistant_sessions(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS assistant_messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
      command_key TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, command_key, role)
    );
    CREATE TABLE IF NOT EXISTS operation_audit (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      session_id TEXT,
      request_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approval_leases (
      request_id INTEGER PRIMARY KEY REFERENCES requests(id),
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approval_jobs (
      request_id INTEGER PRIMARY KEY REFERENCES requests(id),
      generation INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','done','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      retry_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_guards (
      id INTEGER PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES workflows(id),
      field_key TEXT NOT NULL,
      operator TEXT NOT NULL CHECK(operator IN ('gt','gte','lt','lte','eq')),
      threshold REAL NOT NULL,
      reason TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ai_evidence (
      id INTEGER PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      step_id INTEGER NOT NULL,
      approver_id INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_revisions (
      id INTEGER PRIMARY KEY,
      document_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      UNIQUE(document_id, version)
    );
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON operation_audit BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON operation_audit BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS evidence_no_update BEFORE UPDATE ON ai_evidence BEGIN SELECT RAISE(ABORT, 'Evidence records are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS evidence_no_delete BEFORE DELETE ON ai_evidence BEGIN SELECT RAISE(ABORT, 'Evidence records are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS revision_no_update BEFORE UPDATE ON knowledge_revisions BEGIN SELECT RAISE(ABORT, 'Knowledge revisions are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS revision_no_delete BEFORE DELETE ON knowledge_revisions BEGIN SELECT RAISE(ABORT, 'Knowledge revisions are append-only'); END;
  `);
  initialized = db;
}
