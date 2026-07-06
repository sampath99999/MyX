-- MyX Money: Savings Goals
-- A standalone savings tracker (does not affect the transactions balance).
-- Amounts stored in paise (INTEGER).

CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  emoji         TEXT,                                       -- optional icon, e.g. "✈️"
  target_amount INTEGER NOT NULL CHECK (target_amount > 0), -- paise
  saved_amount  INTEGER NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  target_date   TEXT,                                       -- optional YYYY-MM-DD
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,                                       -- set when saved >= target
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id, created_at DESC);
