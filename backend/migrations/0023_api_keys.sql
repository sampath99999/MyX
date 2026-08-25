-- API keys — a credential for programs, not for people.
--
-- The web app signs in and carries a 24h JWT, which is exactly the wrong shape
-- for something like OpenClaw: an assistant that reads your tasks every morning
-- cannot re-enter a password each day, and giving it the password would give it
-- the account — including the power to change that password and lock the owner
-- out of their own data.
--
-- So a key is a deliberately lesser credential. It is named, listed, revocable
-- on its own, and barred from the account surface entirely (see the deny-list in
-- middleware.ts): no logout, no password change, no deletion, no admin.
--
-- Only the SHA-256 of the key is stored, for the same reason password_resets
-- stores only a hash: a leaked database must not hand anyone a working
-- credential. PBKDF2 is right for passwords and pointless here — a password is
-- short and human-chosen, so a stolen hash is worth grinding against; a key is
-- 256 bits straight from the CSPRNG and there is nothing to grind.
--
-- Revoking deletes the row rather than flagging it. "Revoked" and "gone from the
-- list" are the same thing to the person clicking the button, and an unknown
-- hash already fails closed, so a tombstone column would buy nothing.

CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  name         TEXT NOT NULL,          -- "OpenClaw on the laptop"
  key_hash     TEXT NOT NULL UNIQUE,   -- hex SHA-256 of the key; the only copy we keep
  prefix       TEXT NOT NULL,          -- first 12 chars, shown in the UI so keys are tellable apart
  scope        TEXT NOT NULL DEFAULT 'write',  -- 'read' | 'write'
  created_at   INTEGER NOT NULL,       -- unix seconds, like the other token tables
  last_used_at INTEGER,                -- written at most once every few minutes; see lib/apikeys.ts
  expires_at   INTEGER,                -- NULL = never
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Authentication looks the key up by hash, which the UNIQUE constraint already
-- indexes. This one serves the Settings list and the per-user cap on creation.
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
