-- Super admin: an owner-only view of how the app is actually behaving
--
-- Nothing here is reachable by signing up. is_admin is set by hand in D1 and by
-- nothing else — there is deliberately no endpoint, no UI and no flag in any
-- payload that can grant it, so the only way to become an admin is to already
-- have database access.

ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

/*
  Exceptions, grouped rather than logged one row per occurrence.

  Something failing in a loop is exactly when logging is most useful and most
  expensive: a per-occurrence table would spend a free-tier write allowance
  recording the same stack a thousand times. Keyed by fingerprint, a repeat is
  one UPDATE that bumps a counter, so the thousandth failure costs no more than
  the first.
*/
CREATE TABLE IF NOT EXISTS error_log (
  fingerprint  TEXT PRIMARY KEY,        -- hash of route + message shape
  message      TEXT NOT NULL,
  stack        TEXT,
  route        TEXT NOT NULL,
  method       TEXT NOT NULL,
  status       INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 1,
  first_seen   INTEGER NOT NULL,        -- unix seconds
  last_seen    INTEGER NOT NULL,
  last_user_id INTEGER,                 -- who hit it last; no FK, users get deleted
  resolved_at  INTEGER                  -- set when acknowledged, cleared if it recurs
);

CREATE INDEX IF NOT EXISTS idx_error_log_last_seen ON error_log(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_open ON error_log(resolved_at, last_seen DESC);

/*
  A second gate in front of the admin screens.

  The admin's password alone should not open a view of every account's totals:
  a stolen session would otherwise walk straight in. Opening the screens needs a
  fresh code emailed to the admin, and the unlock expires, so the window is
  minutes rather than the life of the token.
*/
CREATE TABLE IF NOT EXISTS admin_sessions (
  user_id        INTEGER PRIMARY KEY,
  code_hash      TEXT,                  -- hex SHA-256 of the emailed code
  expires_at     INTEGER,               -- unix seconds; when the code dies
  attempts       INTEGER NOT NULL DEFAULT 0,
  unlocked_until INTEGER,               -- unix seconds; when access lapses
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
