-- MyX Money: Loans (EMI, reducing-balance)
-- Tracks formal loans (education, home, car…). Interest is computed on the
-- reducing balance each month: interest = outstanding * (annual_rate/12/100).
-- All money in paise (INTEGER); rate is a percent (REAL, e.g. 9.9).

CREATE TABLE IF NOT EXISTS loans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  lender      TEXT,
  principal   INTEGER NOT NULL CHECK (principal > 0),   -- original / EMI-start balance, paise
  annual_rate REAL NOT NULL CHECK (annual_rate >= 0),   -- percent
  emi         INTEGER NOT NULL CHECK (emi > 0),          -- paise
  outstanding INTEGER NOT NULL,                          -- current balance, paise
  start_date  TEXT NOT NULL,                             -- YYYY-MM-DD (first EMI)
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id        INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  amount         INTEGER NOT NULL,   -- paise actually paid (EMI, or less on final)
  interest_part  INTEGER NOT NULL,   -- paise
  principal_part INTEGER NOT NULL,   -- paise
  balance_after  INTEGER NOT NULL,   -- paise
  paid_on        TEXT NOT NULL,      -- YYYY-MM-DD
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loan_rate_changes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id        INTEGER NOT NULL,
  annual_rate    REAL NOT NULL,
  effective_from TEXT NOT NULL,      -- YYYY-MM-DD
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id, id);
