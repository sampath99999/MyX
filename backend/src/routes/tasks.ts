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

/**
 * D1 rejects a query with more than 100 bound parameters, and enrich() binds one
 * per task id. Chunking below that keeps the Tasks views working at any list
 * size instead of failing outright once a user passes 100 tasks.
 */
export const ENRICH_CHUNK_SIZE = 90;

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Attach labels + subtask counts to a set of task rows (2 queries per chunk). */
async function enrich(db: D1Database, rows: TaskRow[]) {
  if (rows.length === 0) return [];

  const labelMap = new Map<number, LabelLite[]>();
  const subMap = new Map<number, { total: number; done: number }>();

  const batches = chunk(
    rows.map((r) => r.id),
    ENRICH_CHUNK_SIZE,
  );

  await Promise.all(
    batches.map(async (ids) => {
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

      for (const r of labelsRes.results ?? []) {
        const arr = labelMap.get(r.task_id) ?? [];
        arr.push({ id: r.id, name: r.name, color: r.color });
        labelMap.set(r.task_id, arr);
      }
      for (const r of subRes.results ?? []) {
        subMap.set(r.task_id, { total: r.total, done: r.done ?? 0 });
      }
    }),
  );

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

/** Parse an integer query param, rejecting junk instead of binding NaN to D1. */
function intQuery(raw: string | undefined, name: string): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new HTTPException(400, { message: `Invalid ${name}` });
  return n;
}

/** Page size for the task list. Bounded so enrich() and the payload stay sane. */
const DEFAULT_TASK_LIMIT = 200;
const MAX_TASK_LIMIT = 500;

/** GET /api/tasks?space_id=&project_id=&view=today|inbox|upcoming&label_id=&today=&limit=&offset= */
tasks.get("/", async (c) => {
  const user = c.get("user");
  const spaceId = intQuery(c.req.query("space_id"), "space_id");
  const projectId = intQuery(c.req.query("project_id"), "project_id");
  const labelId = intQuery(c.req.query("label_id"), "label_id");
  const view = c.req.query("view");

  const limit = Math.min(
    Math.max(intQuery(c.req.query("limit"), "limit") ?? DEFAULT_TASK_LIMIT, 1),
    MAX_TASK_LIMIT,
  );
  const offset = Math.max(intQuery(c.req.query("offset"), "offset") ?? 0, 0);

  const where: string[] = ["t.user_id = ?"];
  const binds: unknown[] = [user.sub];
  let join = "";

  if (spaceId != null) {
    where.push("t.space_id = ?");
    binds.push(spaceId);
  }

  if (labelId != null) {
    join = "JOIN task_labels tl ON tl.task_id = t.id";
    where.push("tl.label_id = ?");
    where.push("t.status = 'open'");
    binds.push(labelId);
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
  } else if (projectId != null) {
    where.push("t.project_id = ?");
    binds.push(projectId);
  } else {
    where.push("t.status = 'open'");
  }

  const order =
    view === "upcoming"
      ? "t.due_date ASC, t.priority ASC, t.id DESC"
      : "t.status ASC, t.position ASC, t.priority ASC, (t.due_date IS NULL) ASC, t.due_date ASC, t.id DESC";

  // LIMIT is not optional here: without it the row count feeds straight into
  // enrich()'s bound-parameter count and the whole module 500s past ~100 tasks.
  const { results } = await c.env.DB.prepare(
    `SELECT t.* FROM tasks t ${join} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
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
/** Ceiling on a reorder payload — it becomes one statement per id. */
const MAX_REORDER = 200;

/**
 * POST /api/tasks/reorder — one column's tasks, in their new order.
 *
 * `/:id/move` sets one task's section and position, which is enough to drop a
 * card at the end of a column and nothing more. Reordering within a column
 * needs every task after the insertion point renumbered, and doing that as N
 * separate calls is both slow and wrong: they race, and a failure halfway
 * leaves two cards claiming the same position.
 *
 * So the client sends the destination column exactly as it should end up. That
 * covers a move between columns too — the task is in the array, so it gets the
 * new section_id along with its index. One batch, one round trip, idempotent on
 * replay.
 *
 * `section_id` may be null: the first column of a board holds every task that
 * has no section, and dropping into it has to be able to say so.
 */
tasks.post("/reorder", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const section_id = body?.section_id != null ? Number(body.section_id) : null;
  if (section_id != null && !Number.isInteger(section_id))
    throw new HTTPException(400, { message: "section_id must be an integer or null" });

  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
  if (ids.some((n) => !Number.isInteger(n)))
    throw new HTTPException(400, { message: "ids must be an array of task ids" });
  // The array length becomes the statement count in the batch below.
  if (ids.length > MAX_REORDER) throw new HTTPException(400, { message: "Too many tasks" });
  if (!ids.length) return c.json({ ok: true });

  /*
    A section this user does not own would otherwise be a way to file tasks into
    someone else's column. The UPDATE is scoped by user_id, so the *tasks* are
    safe either way, but the section_id it writes is attacker-supplied and worth
    checking before it lands in a row.
  */
  if (section_id != null) {
    const owned = await c.env.DB.prepare("SELECT id FROM sections WHERE id = ? AND user_id = ?")
      .bind(section_id, user.sub)
      .first();
    if (!owned) throw new HTTPException(404, { message: "Section not found" });
  }

  await c.env.DB.batch(
    ids.map((taskId, position) =>
      c.env.DB.prepare(
        "UPDATE tasks SET section_id = ?, position = ? WHERE id = ? AND user_id = ?",
      ).bind(section_id, position, taskId, user.sub),
    ),
  );
  return c.json({ ok: true });
});

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
