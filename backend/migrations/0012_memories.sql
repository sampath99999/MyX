-- MyX Memories
-- A lightweight memory journal: title + note + optional date/emoji/tags.
-- v1 is text-only (no photo attachments yet).

CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  emoji       TEXT,
  occurred_on TEXT,                     -- nullable YYYY-MM-DD; defaults to today client-side
  tags        TEXT NOT NULL DEFAULT '', -- comma-separated, same convention as notes.tags
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, occurred_on DESC);
