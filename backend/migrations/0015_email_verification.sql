-- Email verification by one-time code
--
-- Same storage rule as password_resets: only the SHA-256 of the code is kept.
-- A 6-digit code is only a million possibilities, so the row also carries an
-- attempt counter — expiry alone would leave ~1M guesses available inside the
-- window, which a script finishes in seconds.
--
-- Keyed by user_id rather than by code, so requesting a new code replaces the
-- old one instead of leaving several live at once.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_otps (
  user_id    INTEGER PRIMARY KEY,
  code_hash  TEXT NOT NULL,        -- hex SHA-256 of the 6-digit code
  expires_at INTEGER NOT NULL,     -- unix seconds
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);

-- Accounts that existed before verification did are treated as verified: they
-- were created when the address was never in question, and retroactively
-- nagging them for a code nobody sent would be a bug, not a security gain.
UPDATE users SET email_verified = 1;
