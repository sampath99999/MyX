-- Somewhere to remember a suggestion the user said no to.
--
-- Detection reads transactions and proposes recurring rules; without this it
-- would propose the same ones again on the next visit, forever, because the
-- transactions that produced them are still there. A rejected suggestion has to
-- stay rejected, and the only durable identity a suggestion has is the
-- normalised description it was derived from.

CREATE TABLE IF NOT EXISTS recurring_ignored (
  user_id    INTEGER NOT NULL,
  -- The normalised description (see lib/detect.ts). Not the raw note: "NETFLIX
  -- 08/26" and "NETFLIX 09/26" are the same subscription and must not need
  -- dismissing twice.
  signature  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, signature),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
