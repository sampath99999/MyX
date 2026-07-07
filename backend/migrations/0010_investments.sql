-- MyX Money: Investments
-- Manually-tracked holdings (stocks, mutual funds, FDs, PPF/EPF, gold, crypto...).
-- current_value is updated by hand (no live market data); gain/loss is derived.
-- Amounts stored in paise (INTEGER).

CREATE TABLE IF NOT EXISTS investments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('stocks','mutual_fund','fd','ppf_epf','gold','crypto','other')),
  invested_amount INTEGER NOT NULL CHECK (invested_amount >= 0), -- paise
  current_value   INTEGER NOT NULL CHECK (current_value >= 0),   -- paise
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id, created_at DESC);
