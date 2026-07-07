-- MyX Tasks module (Phase 1 MVP)
-- Spaces = top-level life contexts (Personal, Work, Freelance…). You switch between
-- them so contexts never mix. Projects live in a space; tasks live in a space and
-- optionally a project.

CREATE TABLE IF NOT EXISTS spaces (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#8b5cf6',   -- hex, for the space dot
  icon       TEXT NOT NULL DEFAULT '🗂️',         -- emoji
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  space_id   INTEGER NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#8b5cf6',
  archived   INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  space_id     INTEGER NOT NULL,
  project_id   INTEGER,                            -- NULL = Inbox (no project)
  title        TEXT NOT NULL,
  notes        TEXT,
  priority     INTEGER NOT NULL DEFAULT 4,         -- 1=P1 (highest) .. 4=none
  due_date     TEXT,                               -- YYYY-MM-DD, nullable
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_at TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_spaces_user ON spaces(user_id, position);
CREATE INDEX IF NOT EXISTS idx_projects_space ON projects(user_id, space_id, archived);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, space_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(user_id, due_date);
