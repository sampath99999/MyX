-- History for goals and investments
--
-- Both modules only ever stored a current number. Contributing to a goal moved
-- saved_amount and left no trace of when, or how much, or that it happened at
-- all; updating a holding's value overwrote the previous one. Neither could
-- ever draw a progress line, because the past was being discarded on write.
--
-- Recorded going forward only. There is nothing to backfill — the history was
-- never kept.

CREATE TABLE IF NOT EXISTS goal_contributions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id     INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  amount      INTEGER NOT NULL,          -- paise; negative is a withdrawal
  occurred_on TEXT NOT NULL,             -- YYYY-MM-DD, chosen by the user
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal
  ON goal_contributions(goal_id, occurred_on DESC, id DESC);

/*
  One row per recorded valuation. UNIQUE on the day so re-saving a holding
  without changing anything does not pile up duplicate points: the same day is
  updated in place, which is what someone correcting a typo expects.
*/
CREATE TABLE IF NOT EXISTS investment_values (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  investment_id INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  value         INTEGER NOT NULL,        -- paise
  recorded_on   TEXT NOT NULL,           -- YYYY-MM-DD
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_investment_values_day
  ON investment_values(investment_id, recorded_on);

-- Seed each existing holding with its current value, so the first real update
-- has something to draw a line from rather than starting at a single point.
INSERT INTO investment_values (investment_id, user_id, value, recorded_on)
SELECT id, user_id, current_value, date(COALESCE(updated_at, created_at, 'now'))
FROM investments;
