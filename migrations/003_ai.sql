ALTER TABLE preferences ADD COLUMN ai_goals INTEGER NOT NULL DEFAULT 0 CHECK(ai_goals IN (0, 1));
ALTER TABLE preferences ADD COLUMN ai_notes INTEGER NOT NULL DEFAULT 0 CHECK(ai_notes IN (0, 1));
ALTER TABLE preferences ADD COLUMN ai_finance INTEGER NOT NULL DEFAULT 0 CHECK(ai_finance IN (0, 1));
ALTER TABLE preferences ADD COLUMN ai_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, id)
) STRICT;
CREATE INDEX conversations_recent ON conversations(user_id, updated_at DESC, id DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'completed',
  domains INTEGER NOT NULL DEFAULT 0,
  sources TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, conversation_id, id),
  UNIQUE(conversation_id, seq),
  FOREIGN KEY(user_id, conversation_id) REFERENCES conversations(user_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')),
  error_code TEXT,
  authorization_version INTEGER NOT NULL,
  input TEXT NOT NULL,
  provider TEXT NOT NULL,
  domains INTEGER NOT NULL DEFAULT 0,
  request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, request_key),
  UNIQUE(user_id, id),
  UNIQUE(user_message_id, attempt),
  FOREIGN KEY(user_id, conversation_id, user_message_id) REFERENCES messages(user_id, conversation_id, id) ON DELETE CASCADE,
  FOREIGN KEY(user_id, conversation_id, assistant_message_id) REFERENCES messages(user_id, conversation_id, id) ON DELETE CASCADE
) STRICT;
CREATE UNIQUE INDEX ai_one_active_per_chat ON ai_runs(conversation_id) WHERE status IN ('queued','running');
CREATE INDEX ai_recent_runs ON ai_runs(user_id, created_at);

CREATE TABLE ai_proposals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','applied','rejected','expired','invalidated')),
  payload TEXT NOT NULL,
  preview TEXT NOT NULL,
  result TEXT,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id, run_id) REFERENCES ai_runs(user_id, id) ON DELETE CASCADE
) STRICT;
CREATE TABLE operation_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX operation_audit_recent ON operation_audit(user_id, created_at);
