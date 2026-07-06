-- MyX Money: Budgets
-- A monthly spending limit per expense category. Actual spend is computed live
-- from `transactions` for the current month (not stored here).

CREATE TABLE IF NOT EXISTS budgets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  category   TEXT NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),   -- monthly limit, paise
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, category);
