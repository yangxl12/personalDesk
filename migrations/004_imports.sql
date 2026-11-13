CREATE TABLE demo_imports (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  counts TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, fingerprint)
) STRICT;
