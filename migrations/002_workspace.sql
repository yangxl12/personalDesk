CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tone TEXT NOT NULL CHECK(tone IN ('violet','mint','amber')),
  total_tasks INTEGER NOT NULL DEFAULT 0,
  done_tasks INTEGER NOT NULL DEFAULT 0 CHECK(done_tasks BETWEEN 0 AND total_tasks),
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, id)
) STRICT;
CREATE INDEX goals_recent ON goals(user_id, updated_at DESC, id DESC);
CREATE INDEX goals_status ON goals(user_id, (total_tasks > 0 AND done_tasks = total_tasks), updated_at DESC, id DESC);

CREATE TABLE goal_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  done_tasks INTEGER NOT NULL DEFAULT 0 CHECK(done_tasks BETWEEN 0 AND total_tasks),
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, id),
  FOREIGN KEY(user_id, goal_id) REFERENCES goals(user_id, id) ON DELETE CASCADE
) STRICT;
CREATE INDEX goal_items_order ON goal_items(user_id, goal_id, created_at, id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(user_id, item_id) REFERENCES goal_items(user_id, id) ON DELETE CASCADE
) STRICT;
CREATE INDEX tasks_order ON tasks(user_id, item_id, created_at, id);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) > 0),
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX notes_recent ON notes(user_id, updated_at DESC, id DESC);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('income','expense')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 10000000000),
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX transactions_month ON transactions(user_id, occurred_on DESC, id DESC);

CREATE TABLE savings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_cents INTEGER CHECK(current_cents BETWEEN 0 AND 10000000000),
  target_cents INTEGER CHECK(target_cents BETWEEN 1 AND 10000000000),
  version INTEGER NOT NULL DEFAULT 1
) STRICT;
