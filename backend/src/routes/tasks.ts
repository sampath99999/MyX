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
  title: string;
  notes: string | null;
  priority: number;
  due_date: string | null;
  status: "open" | "done";
  completed_at: string | null;
  position: number;
  created_at: string;
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function serialize(t: TaskRow) {
  return {
    id: t.id,
    space_id: t.space_id,
    project_id: t.project_id,
    title: t.title,
    notes: t.notes,
    priority: t.priority,
    due_date: t.due_date,
    status: t.status,
    completed_at: t.completed_at,
    created_at: t.created_at,
  };
}

/** Server date (UTC) unless the client passes a valid local date. */
function today(c: { req: { query: (k: string) => string | undefined } }): string {
  const q = c.req.query("today");
  return q && dateRe.test(q) ? q : new Date().toISOString().slice(0, 10);
}

/** GET /api/tasks?space_id=&project_id=&view=today|inbox&today=YYYY-MM-DD */
tasks.get("/", async (c) => {
  const user = c.get("user");
  const spaceId = c.req.query("space_id");
  const projectId = c.req.query("project_id");
  const view = c.req.query("view");

  const where: string[] = ["user_id = ?"];
  const binds: unknown[] = [user.sub];

  if (spaceId) {
    where.push("space_id = ?");
    binds.push(Number(spaceId));
  }

  if (view === "today") {
    where.push("status = 'open'");
    where.push("due_date IS NOT NULL AND due_date <= ?");
    binds.push(today(c));
  } else if (view === "inbox") {
    where.push("status = 'open'");
    where.push("project_id IS NULL");
  } else if (projectId) {
    where.push("project_id = ?");
    binds.push(Number(projectId));
  } else {
    where.push("status = 'open'");
  }

  // Open first, then by priority, due date, and recency.
  const sql = `SELECT * FROM tasks WHERE ${where.join(" AND ")}
     ORDER BY status ASC, priority ASC,
              (due_date IS NULL) ASC, due_date ASC, id DESC`;

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<TaskRow>();
  return c.json({ tasks: (results ?? []).map(serialize) });
});

/** GET /api/tasks/counts?space_id=&today= — badge counts for Today & Inbox. */
tasks.get("/counts", async (c) => {
  const user = c.get("user");
  const spaceId = c.req.query("space_id");
  const spaceClause = spaceId ? " AND space_id = ?" : "";
  const spaceBind: unknown[] = spaceId ? [Number(spaceId)] : [];

  const todayRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'open'
       AND due_date IS NOT NULL AND due_date <= ?${spaceClause}`,
  )
    .bind(user.sub, today(c), ...spaceBind)
    .first<{ c: number }>();

  const inboxRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'open'
       AND project_id IS NULL${spaceClause}`,
  )
    .bind(user.sub, ...spaceBind)
    .first<{ c: number }>();

  return c.json({ today: todayRow?.c ?? 0, inbox: inboxRow?.c ?? 0 });
});

/** POST /api/tasks — create. Body: { title, space_id, project_id?, due_date?, priority?, notes? } */
tasks.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const title = String(body?.title ?? "").trim();
  const space_id = Number(body?.space_id);
  const project_id = body?.project_id != null ? Number(body.project_id) : null;
  const due_date = body?.due_date ? String(body.due_date) : null;
  const priority = body?.priority != null ? Number(body.priority) : 4;
  const notes = body?.notes ? String(body.notes).trim() : null;

  if (!title) throw new HTTPException(400, { message: "Task title is required" });
  if (!Number.isInteger(space_id)) throw new HTTPException(400, { message: "space_id is required" });
  if (due_date && !dateRe.test(due_date))
    throw new HTTPException(400, { message: "due_date must be YYYY-MM-DD" });
  if (![1, 2, 3, 4].includes(priority))
    throw new HTTPException(400, { message: "priority must be 1..4" });

  // Validate space ownership; validate project belongs to that space if given.
  const space = await c.env.DB.prepare("SELECT id FROM spaces WHERE id = ? AND user_id = ?")
    .bind(space_id, user.sub)
    .first();
  if (!space) throw new HTTPException(404, { message: "Space not found" });
  if (project_id != null) {
    const proj = await c.env.DB.prepare(
      "SELECT id FROM projects WHERE id = ? AND user_id = ? AND space_id = ?",
    )
      .bind(project_id, user.sub, space_id)
      .first();
    if (!proj) throw new HTTPException(400, { message: "Project not in this space" });
  }

  const created = await c.env.DB.prepare(
    `INSERT INTO tasks (user_id, space_id, project_id, title, notes, priority, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(user.sub, space_id, project_id, title, notes, priority, due_date)
    .first<TaskRow>();
  return c.json({ task: serialize(created!) }, 201);
});

/** PATCH /api/tasks/:id — edit fields (title, notes, due_date, priority, project_id, space_id). */
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
    `UPDATE tasks SET title = ?, notes = ?, priority = ?, due_date = ?, project_id = ?, space_id = ?
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(title, notes, priority, due_date, project_id, space_id, id, user.sub)
    .first<TaskRow>();
  return c.json({ task: serialize(updated!) });
});

/** POST /api/tasks/:id/complete and /reopen */
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
  return c.json({ task: serialize(updated) });
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

export default tasks;
