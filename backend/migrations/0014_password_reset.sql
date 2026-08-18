-- Password reset
--
-- Only the SHA-256 of the token is stored. The plaintext exists in the emailed
-- link and nowhere else, so a leaked database cannot be used to reset anyone's
-- password — the same reasoning that applies to the password column itself.
--
-- Rows are single-use (used_at) and short-lived (expires_at). Expired rows are
-- swept by the scheduled handler rather than at request time, so a reset never
-- pays for someone else's cleanup.

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,          -- hex SHA-256 of the emailed token
  user_id    INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,          -- unix seconds
  used_at    INTEGER,                   -- set the moment it is redeemed
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Lookup on redeem is by primary key; these two serve the sweep and the
-- "invalidate this user's outstanding links" step after a successful reset.
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
