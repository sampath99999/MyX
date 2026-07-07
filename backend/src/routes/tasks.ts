import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const tasks = new Hono<AppBindings>();
tasks.use("*", requireAuth);

interface TaskRow {
  id: number;
  space_id: number;
  project_id: number | null;
  section_id: number | null;
  title: string;
  notes: string | null;
  priority: number;
  due_date: string | null;
  status: "open" | "done";
  completed_at: string | null;
  position: number;
  created_at: string;
}

interface LabelLite {
  id: number;
  name: string;
  color: string;
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function baseTask(t: TaskRow) {
  return {
    id: t.id,
    space_id: t.space_id,
    project_id: t.project_id,
    section_id: t.section_id,
    title: t.title,
    notes: t.notes,
    priority: t.priority,
    due_date: t.due_date,
    status: t.status,
    completed_at: t.completed_at,
    position: t.position,
    created_at: t.created_at,
  };
}

/** Attach labels + subtask counts to a set of task rows (2 extra queries total). */
async function enrich(db: D1Database, rows: TaskRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  const [labelsRes, subRes] = await Promise.all([
    db
      .prepare(
        `SELECT tl.task_id, l.id, l.name, l.color
         FROM task_labels tl JOIN labels l ON l.id = tl.label_id
         WHERE tl.task_id IN (${placeholders})`,
      )
      .bind(...ids)
      .all<{ task_id: number; id: number; name: string; color: string }>(),
    db
      .prepare(
        `SELECT task_id, COUNT(*) AS total, SUM(done) AS done
         FROM subtasks WHERE task_id IN (${placeholders}) GROUP BY task_id`,
      )
      .bind(...ids)
      .all<{ task_id: number; total: number; done: number }>(),
  ]);

  const labelMap = new Map<number, LabelLite[]>();
  for (const r of labelsRes.results ?? []) {
    const arr = labelMap.get(r.task_id) ?? [];
    arr.push({ id: r.id, name: r.name, color: r.color });
    labelMap.set(r.task_id, arr);
  }
  const subMap = new Map<number, { total: number; done: number }>();
  for (const r of subRes.results ?? []) {
    subMap.set(r.task_id, { total: r.total, done: r.done ?? 0 });
  }

  return rows.map((t) => ({
    ...baseTask(t),
    labels: labelMap.get(t.id) ?? [],
    subtasks: subMap.get(t.id) ?? { total: 0, done: 0 },
  }));
}

function today(c: { req: { query: (k: string) => string | undefined } }): string {
  const q = c.req.query("today");
  return q && dateRe.test(q) ? q : new Date().toISOString().slice(0, 10);
}

/** GET /api/tasks?space_id=&project_id=&view=today|inbox|upcoming&label_id=&today= */
tasks.get("/", async (c) => {
  const user = c.get("user");
  const spaceId = c.req.query("space_id");
  const projectId = c.req.query("project_id");
  const labelId = c.req.query("label_id");
  const view = c.req.query("view");

  const where: string[] = ["t.user_id = ?"];
  const binds: unknown[] = [user.sub];
  let join = "";

  if (spaceId) {
    where.push("t.space_id = ?");
    binds.push(Number(spaceId));
  }

  if (labelId) {
    join = "JOIN task_labels tl ON tl.task_id = t.id";
    where.push("tl.label_id = ?");
    where.push("t.status = 'open'");
    binds.push(Number(labelId));
  } else if (view === "today") {
    where.push("t.status = 'open'");
    where.push("t.due_date IS NOT NULL AND t.due_date <= ?");
    binds.push(today(c));
  } else if (view === "upcoming") {
    where.push("t.status = 'open'");
    where.push("t.due_date IS NOT NULL AND t.due_date > ?");
    binds.push(today(c));
  } else if (view === "inbox") {
    where.push("t.status = 'open'");
    where.push("t.project_id IS NULL");
  } else if (projectId) {
    where.push("t.project_id = ?");
    binds.push(Number(projectId));
  } else {
    where.push("t.status = 'open'");
  }

  const order =
    view === "upcoming"
      ? "t.due_date ASC, t.priority ASC, t.id DESC"
      : "t.status ASC, t.position ASC, t.priority ASC, (t.due_date IS NULL) ASC, t.due_date ASC, t.id DESC";

  const { results } = await c.env.DB.prepare(
    `SELECT t.* FROM tasks t ${join} WHERE ${where.join(" AND ")} ORDER BY ${order}`,
  )
    .bind(...binds)
    .all<TaskRow>();

  return c.json({ tasks: await enrich(c.env.DB, results ?? []) });
});

/** GET /api/tasks/counts?space_id=&today= — Today, Inbox, Upcoming badges. */
tasks.get("/counts", async (c) => {
  const user = c.get("user");
  const spaceId = c.req.query("space_id");
  const spaceClause = spaceId ? " AND space_id = ?" : "";
  const spaceBind: unknown[] = spaceId ? [Number(spaceId)] : [];
  const t = today(c);

  const [todayRow, inboxRow, upcomingRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'open'
         AND due_date IS NOT NULL AND due_date <= ?${spaceClause}`,
    )
      .bind(user.sub, t, ...spaceBind)
      .first<{ c: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'open'
         AND project_id IS NULL${spaceClause}`,
    )
      .bind(user.sub, ...spaceBind)
      .first<{ c: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'open'
         AND due_date IS NOT NULL AND due_date > ?${spaceClause}`,
    )
      .bind(user.sub, t, ...spaceBind)
      .first<{ c: number }>(),
  ]);

  return c.json({
    today: todayRow?.c ?? 0,
    inbox: inboxRow?.c ?? 0,
    upcoming: upcomingRow?.c ?? 0,
  });
});

/** GET /api/tasks/:id — one task with labels + subtasks (full list). */
tasks.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const task = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<TaskRow>();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const [labelsRes, subRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.id, l.name, l.color FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = ? ORDER BY l.name`,
    )
      .bind(id)
      .all<LabelLite>(),
    c.env.DB.prepare("SELECT id, title, done, position FROM subtasks WHERE task_id = ? ORDER BY position, id")
      .bind(id)
      .all<{ id: number; title: string; done: number; position: number }>(),
  ]);

  return c.json({
    task: baseTask(task),
    labels: labelsRes.results ?? [],
    subtasks: (subRes.results ?? []).map((s) => ({ ...s, done: s.done === 1 })),
  });
});

/** POST /api/tasks — create. */
tasks.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const title = String(body?.title ?? "").trim();
  const space_id = Number(body?.space_id);
  const project_id = body?.project_id != null ? Number(body.project_id) : null;
  const section_id = body?.section_id != null ? Number(body.section_id) : null;
  const due_date = body?.due_date ? String(body.due_date) : null;
  const priority = body?.priority != null ? Number(body.priority) : 4;
  const notes = body?.notes ? String(body.notes).trim() : null;
  const labelIds: number[] = Array.isArray(body?.label_ids) ? body.label_ids.map(Number) : [];

  if (!title) throw new HTTPException(400, { message: "Task title is required" });
  if (!Number.isInteger(space_id)) throw new HTTPException(400, { message: "space_id is required" });
  if (due_date && !dateRe.test(due_date))
    throw new HTTPException(400, { message: "due_date must be YYYY-MM-DD" });
  if (![1, 2, 3, 4].includes(priority))
    throw new HTTPException(400, { message: "priority must be 1..4" });

  const space = await c.env.DB.prepare("SELECT id FROM spaces WHERE id = ? AND user_id = ?")
    .bind(space_id, user.sub)
    .first();
  if (!space) throw new HTTPException(404, { message: "Space not found" });

  const created = await c.env.DB.prepare(
    `INSERT INTO tasks (user_id, space_id, project_id, section_id, title, notes, priority, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(user.sub, space_id, project_id, section_id, title, notes, priority, due_date)
    .first<TaskRow>();

  if (labelIds.length > 0) {
    await c.env.DB.batch(
      labelIds.map((lid) =>
        c.env.DB.prepare(
          "INSERT OR IGNORE INTO task_labels (task_id, label_id) SELECT ?, id FROM labels WHERE id = ? AND user_id = ?",
        ).bind(created!.id, lid, user.sub),
      ),
    );
  }

  const [enriched] = await enrich(c.env.DB, [created!]);
  return c.json({ task: enriched }, 201);
});

/** PATCH /api/tasks/:id — edit fields. */
tasks.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const task = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<TaskRow>();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const title = body?.title != null ? String(body.title).trim() : task.title;
  const notes = body?.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : task.notes;
  const priority = body?.priority != null ? Number(body.priority) : task.priority;
  const due_date =
    body?.due_date !== undefined ? (body.due_date ? String(body.due_date) : null) : task.due_date;
  const project_id =
    body?.project_id !== undefined
      ? body.project_id === null
        ? null
        : Number(body.project_id)
      : task.project_id;
  const space_id = body?.space_id != null ? Number(body.space_id) : task.space_id;

  if (!title) throw new HTTPException(400, { message: "Task title is required" });
  if (due_date && !dateRe.test(due_date))
    throw new HTTPException(400, { message: "due_date must be YYYY-MM-DD" });
  if (![1, 2, 3, 4].includes(priority))
    throw new HTTPException(400, { message: "priority must be 1..4" });

  const updated = await c.env.DB.prepare(
    `UPDATE tasks SET title=?, notes=?, priority=?, due_date=?, project_id=?, space_id=?
     WHERE id=? AND user_id=? RETURNING *`,
  )
    .bind(title, notes, priority, due_date, project_id, space_id, id, user.sub)
    .first<TaskRow>();
  const [enriched] = await enrich(c.env.DB, [updated!]);
  return c.json({ task: enriched });
});

/** PUT /api/tasks/:id/labels — replace the label set. Body: { label_ids: number[] } */
tasks.put("/:id/labels", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const labelIds: number[] = Array.isArray(body?.label_ids) ? body.label_ids.map(Number) : [];
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const task = await c.env.DB.prepare("SELECT id FROM tasks WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const stmts = [c.env.DB.prepare("DELETE FROM task_labels WHERE task_id = ?").bind(id)];
  for (const lid of labelIds) {
    stmts.push(
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO task_labels (task_id, label_id) SELECT ?, id FROM labels WHERE id = ? AND user_id = ?",
      ).bind(id, lid, user.sub),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

/** POST /api/tasks/:id/complete|reopen */
tasks.post("/:id/:action{complete|reopen}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const action = c.req.param("action");
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const status = action === "complete" ? "done" : "open";
  const completedAt = action === "complete" ? new Date().toISOString() : null;

  const updated = await c.env.DB.prepare(
    "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(status, completedAt, id, user.sub)
    .first<TaskRow>();
  if (!updated) throw new HTTPException(404, { message: "Task not found" });
  const [enriched] = await enrich(c.env.DB, [updated]);
  return c.json({ task: enriched });
});

/** POST /api/tasks/:id/move — Kanban move. Body: { section_id, position } */
tasks.post("/:id/move", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const section_id = body?.section_id != null ? Number(body.section_id) : null;
  const position = body?.position != null ? Number(body.position) : 0;

  const updated = await c.env.DB.prepare(
    "UPDATE tasks SET section_id = ?, position = ? WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(section_id, position, id, user.sub)
    .first<TaskRow>();
  if (!updated) throw new HTTPException(404, { message: "Task not found" });
  return c.json({ ok: true });
});

/** DELETE /api/tasks/:id */
tasks.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Task not found" });
  return c.json({ ok: true });
});

// ---------- Subtasks ----------

/** POST /api/tasks/:id/subtasks — add a subtask. */
tasks.post("/:id/subtasks", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  if (!title) throw new HTTPException(400, { message: "Subtask title is required" });

  const task = await c.env.DB.prepare("SELECT id FROM tasks WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const posRow = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM subtasks WHERE task_id = ?",
  )
    .bind(id)
    .first<{ pos: number }>();

  const created = await c.env.DB.prepare(
    "INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?) RETURNING id, title, done, position",
  )
    .bind(id, title, posRow?.pos ?? 0)
    .first<{ id: number; title: string; done: number; position: number }>();
  return c.json({ subtask: { ...created!, done: false } }, 201);
});

/** PATCH /api/tasks/:taskId/subtasks/:subId — toggle/rename. */
tasks.patch("/:taskId/subtasks/:subId", async (c) => {
  const user = c.get("user");
  const taskId = Number(c.req.param("taskId"));
  const subId = Number(c.req.param("subId"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(taskId) || !Number.isInteger(subId))
    throw new HTTPException(400, { message: "Invalid id" });

  // Ownership via the parent task.
  const owns = await c.env.DB.prepare(
    "SELECT s.id, s.title, s.done FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ? AND s.task_id = ? AND t.user_id = ?",
  )
    .bind(subId, taskId, user.sub)
    .first<{ id: number; title: string; done: number }>();
  if (!owns) throw new HTTPException(404, { message: "Subtask not found" });

  const title = body?.title != null ? String(body.title).trim() : owns.title;
  const done = body?.done != null ? (body.done ? 1 : 0) : owns.done;
  if (!title) throw new HTTPException(400, { message: "Subtask title is required" });

  const updated = await c.env.DB.prepare(
    "UPDATE subtasks SET title = ?, done = ? WHERE id = ? RETURNING id, title, done, position",
  )
    .bind(title, done, subId)
    .first<{ id: number; title: string; done: number; position: number }>();
  return c.json({ subtask: { ...updated!, done: updated!.done === 1 } });
});

/** DELETE /api/tasks/:taskId/subtasks/:subId */
tasks.delete("/:taskId/subtasks/:subId", async (c) => {
  const user = c.get("user");
  const taskId = Number(c.req.param("taskId"));
  const subId = Number(c.req.param("subId"));
  if (!Number.isInteger(taskId) || !Number.isInteger(subId))
    throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare(
    "DELETE FROM subtasks WHERE id = ? AND task_id IN (SELECT id FROM tasks WHERE id = ? AND user_id = ?)",
  )
    .bind(subId, taskId, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Subtask not found" });
  return c.json({ ok: true });
});

export default tasks;
