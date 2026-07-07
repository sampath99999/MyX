-- MyX Notes module
-- Folders (notebooks) group notes; notes hold markdown content, tags (comma-separated),
-- pin, optional color, and a soft-delete (archived = Trash).

CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#8b5cf6',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  folder_id  INTEGER,
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',        -- markdown
  tags       TEXT NOT NULL DEFAULT '',        -- comma-separated
  pinned     INTEGER NOT NULL DEFAULT 0,
  color      TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,      -- 1 = in Trash
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id, position);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, archived, pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
