-- Daily digest
--
-- One email a day, and only on days something is actually due. An unconditional
-- digest trains people to ignore it, and it would spend the Resend free tier on
-- messages that say nothing.

-- Opt-out lives on the user, so turning it off survives everything except
-- deleting the account. Default on: a digest nobody asked for is annoying, but
-- a reminder feature nobody discovers is useless, and the toggle is one click
-- away in settings.
ALTER TABLE users ADD COLUMN digest_enabled INTEGER NOT NULL DEFAULT 1;

-- One row per user per day, written *before* the send. The cron can fire more
-- than once — retries, overlapping schedules, a manual trigger — and the unique
-- key is what stops a second run mailing the same digest again.
CREATE TABLE IF NOT EXISTS digest_log (
  user_id INTEGER NOT NULL,
  sent_on TEXT NOT NULL,               -- YYYY-MM-DD in the digest's timezone
  items   INTEGER NOT NULL DEFAULT 0,  -- how many things it reported, for debugging
  PRIMARY KEY (user_id, sent_on),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digest_log_sent ON digest_log(sent_on);
