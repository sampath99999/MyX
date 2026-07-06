-- MyX Money: Recurring transactions (bills & subscriptions)
-- A template that repeats on a schedule. Marking it paid creates a real row in
-- `transactions` (affecting the balance) and advances `next_due`.

CREATE TABLE IF NOT EXISTS recurring (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount       INTEGER NOT NULL CHECK (amount > 0),         -- paise
  category     TEXT NOT NULL,
  frequency    TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  interval     INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1), -- every N periods
  next_due     TEXT NOT NULL,                               -- YYYY-MM-DD
  note         TEXT,
  active       INTEGER NOT NULL DEFAULT 1,                  -- 1 = active, 0 = paused
  last_paid_on TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id, next_due);
