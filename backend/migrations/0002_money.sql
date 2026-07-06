-- MyX Money module: transactions
-- Amount is stored as an INTEGER in the smallest unit (paise) to avoid float errors.
-- balance = SUM(income) - SUM(expense).

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount      INTEGER NOT NULL CHECK (amount > 0),   -- in paise
  category    TEXT NOT NULL,
  note        TEXT,
  occurred_on TEXT NOT NULL,                          -- YYYY-MM-DD
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_type ON transactions(user_id, type);
