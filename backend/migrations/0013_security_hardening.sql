-- MyX security hardening
-- 1. token_version  -> makes logout / password change actually revoke issued JWTs
-- 2. auth_attempts  -> rate limiting for login & register (checked BEFORE PBKDF2 runs)
-- 3. idempotency_key -> stops a double-tap on "Pay EMI" booking two payments

-- ---------- 1. Token revocation ----------
-- Every JWT carries the version it was signed with; requireAuth rejects a token
-- whose version is behind the row. Bumping this invalidates that user's tokens.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- ---------- 2. Auth rate limiting ----------
-- One row per (bucket_key, window_start). Fixed-window counter: cheap single
-- upsert per attempt, and it is read before any password hashing happens.
CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket_key   TEXT NOT NULL,      -- e.g. 'login:ip:1.2.3.4' or 'login:email:a@b.c'
  window_start INTEGER NOT NULL,   -- unix seconds, floored to the window size
  attempts     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, window_start)
);

-- Lets the periodic cleanup delete expired windows without a full scan.
CREATE INDEX IF NOT EXISTS idx_auth_attempts_window ON auth_attempts(window_start);

-- ---------- 3. Loan payment idempotency ----------
-- Nullable so existing rows stay valid; SQLite treats NULLs as distinct in a
-- UNIQUE index, so historical payments do not collide with each other.
ALTER TABLE loan_payments ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_payments_idem
  ON loan_payments(loan_id, idempotency_key);
