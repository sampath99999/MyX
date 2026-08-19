-- Account deletion becomes reversible.
--
-- Deleting used to run `DELETE FROM users`, and every ON DELETE CASCADE took the
-- transactions, notes, tasks and the rest with it in the same statement. The
-- Settings page said so plainly — "it cannot be undone and there is no backup to
-- restore from" — which was true, and that was the problem: one mistaken tap on
-- a phone was unrecoverable, and the only reason a real account was ever brought
-- back was that Cloudflare keeps 30 days of database history.
--
-- The row now survives for a grace period. deleted_at marks the moment it was
-- requested; the daily cron erases anything past the window, and signing back in
-- before then cancels the deletion. Nothing else changes: token_version is
-- bumped alongside this, so every existing session dies immediately and a
-- deleted account is as unusable as it was before.

ALTER TABLE users ADD COLUMN deleted_at INTEGER;

-- The purge sweep asks "anything deleted before X?" once a day, and every other
-- query asks "is this one deleted?". Partial index: active accounts are the
-- overwhelming majority and none of them belong in here.
CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON users (deleted_at) WHERE deleted_at IS NOT NULL;
