import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const projects = new Hono<AppBindings>();
projects.use("*", requireAuth);

interface ProjectRow {
  id: number;
  space_id: number;
  name: string;
  color: string;
  archived: number;
  position: number;
  view: string;
  created_at: string;
}

function serialize(p: ProjectRow & { open_count?: number }) {
  return {
    id: p.id,
    space_id: p.space_id,
    name: p.name,
    color: p.color,
    archived: p.archived === 1,
    position: p.position,
    view: p.view === "board" ? "board" : "list",
    open_count: p.open_count ?? 0,
    created_at: p.created_at,
  };
}

/** GET /api/projects?space_id= — projects (with open task counts). */
projects.get("/", async (c) => {
  const user = c.get("user");
  const spaceId = c.req.query("space_id");

  let sql = `SELECT p.*, (
      SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'open'
    ) AS open_count
    FROM projects p WHERE p.user_id = ? AND p.archived = 0`;
  const binds: unknown[] = [user.sub];
  if (spaceId) {
    sql += " AND p.space_id = ?";
    binds.push(Number(spaceId));
  }
  sql += " ORDER BY p.position, p.id";

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<ProjectRow & { open_count: number }>();
  return c.json({ projects: (results ?? []).map(serialize) });
});

/** POST /api/projects — create in a space. */
projects.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const space_id = Number(body?.space_id);
  const name = String(body?.name ?? "").trim();
  const color = body?.color ? String(body.color) : "#8b5cf6";

  if (!Number.isInteger(space_id)) throw new HTTPException(400, { message: "space_id is required" });
  if (!name) throw new HTTPException(400, { message: "Project name is required" });

  // Ensure the space belongs to the user.
  const space = await c.env.DB.prepare("SELECT id FROM spaces WHERE id = ? AND user_id = ?")
    .bind(space_id, user.sub)
    .first();
  if (!space) throw new HTTPException(404, { message: "Space not found" });

  const posRow = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM projects WHERE user_id = ? AND space_id = ?",
  )
    .bind(user.sub, space_id)
    .first<{ pos: number }>();

  const created = await c.env.DB.prepare(
    "INSERT INTO projects (user_id, space_id, name, color, position) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(user.sub, space_id, name, color, posRow?.pos ?? 0)
    .first<ProjectRow>();
  return c.json({ project: serialize({ ...created!, open_count: 0 }) }, 201);
});

/** PATCH /api/projects/:id — rename / recolor / archive. */
projects.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<ProjectRow>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const name = body?.name != null ? String(body.name).trim() : project.name;
  const color = body?.color != null ? String(body.color) : project.color;
  const archived = body?.archived != null ? (body.archived ? 1 : 0) : project.archived;
  const view = body?.view === "board" || body?.view === "list" ? body.view : project.view;
  if (!name) throw new HTTPException(400, { message: "Project name is required" });

  /*
    Moving a project to another space.

    The catch is that tasks carry their own space_id as well as their
    project_id — the Today, Upcoming and Inbox views filter on the task's
    space, not on its project's. So moving the project alone would leave every
    task behind: filed under a project in the new space while still counted
    against the old one, visible in neither space's list in the way anyone
    would expect. The tasks move with it, in the same batch, so there is no
    window in which the two disagree.
  */
  const movingTo = body?.space_id != null ? Number(body.space_id) : null;
  if (movingTo != null) {
    if (!Number.isInteger(movingTo))
      throw new HTTPException(400, { message: "space_id must be an integer" });

    // Someone else's space would otherwise be a place to file your own work
    // into — and, worse, a way to make it appear in their lists.
    const space = await c.env.DB.prepare("SELECT id FROM spaces WHERE id = ? AND user_id = ?")
      .bind(movingTo, user.sub)
      .first();
    if (!space) throw new HTTPException(404, { message: "Space not found" });
  }

  const space_id = movingTo ?? project.space_id;
  const changingSpace = space_id !== project.space_id;

  // Land it at the end of the destination rather than colliding with whatever
  // already holds its old position there.
  let position = project.position;
  if (changingSpace) {
    const posRow = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM projects WHERE user_id = ? AND space_id = ?",
    )
      .bind(user.sub, space_id)
      .first<{ pos: number }>();
    position = posRow?.pos ?? 0;
  }

  const statements = [
    c.env.DB.prepare(
      "UPDATE projects SET name = ?, color = ?, archived = ?, view = ?, space_id = ?, position = ? WHERE id = ? AND user_id = ?",
    ).bind(name, color, archived, view, space_id, position, id, user.sub),
  ];
  if (changingSpace) {
    statements.push(
      c.env.DB.prepare(
        "UPDATE tasks SET space_id = ? WHERE project_id = ? AND user_id = ?",
      ).bind(space_id, id, user.sub),
    );
  }
  await c.env.DB.batch(statements);

  const updated = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<ProjectRow>();
  return c.json({ project: serialize(updated!) });
});

// ---------- Sections (Kanban columns) ----------

interface SectionRow {
  id: number;
  project_id: number;
  name: string;
  position: number;
}

const DEFAULT_SECTIONS = ["To do", "Doing", "Done"];

/** Ceiling on a reorder payload — it becomes one statement per id. */
const MAX_REORDER = 200;

/** GET /api/projects/:id/sections — seeds To do / Doing / Done on first use. */
projects.get("/:id/sections", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  let { results } = await c.env.DB.prepare(
    "SELECT id, project_id, name, position FROM sections WHERE project_id = ? ORDER BY position, id",
  )
    .bind(id)
    .all<SectionRow>();

  if (!results || results.length === 0) {
    await c.env.DB.batch(
      DEFAULT_SECTIONS.map((name, i) =>
        c.env.DB.prepare(
          "INSERT INTO sections (user_id, project_id, name, position) VALUES (?, ?, ?, ?)",
        ).bind(user.sub, id, name, i),
      ),
    );
    const seeded = await c.env.DB.prepare(
      "SELECT id, project_id, name, position FROM sections WHERE project_id = ? ORDER BY position, id",
    )
      .bind(id)
      .all<SectionRow>();
    results = seeded.results;
  }

  return c.json({ sections: results ?? [] });
});

/** POST /api/projects/:id/sections — add a column. */
projects.post("/:id/sections", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  if (!name) throw new HTTPException(400, { message: "Section name is required" });

  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const posRow = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sections WHERE project_id = ?",
  )
    .bind(id)
    .first<{ pos: number }>();

  const created = await c.env.DB.prepare(
    "INSERT INTO sections (user_id, project_id, name, position) VALUES (?, ?, ?, ?) RETURNING id, project_id, name, position",
  )
    .bind(user.sub, id, name, posRow?.pos ?? 0)
    .first<SectionRow>();
  return c.json({ section: created }, 201);
});

/**
 * POST /api/projects/:id/sections/reorder — the columns, in their new order.
 *
 * The whole list rather than "move section 4 to index 1". A single move has to
 * be expanded into a renumber of everything after it anyway, and doing that
 * expansion on the client means the server trusts an arithmetic result it
 * cannot check. Sending the order outright makes the write idempotent: replay
 * it and the board lands in the same place.
 *
 * Positions are rewritten from the array index, and the WHERE clause carries
 * both project_id and user_id, so an id belonging to someone else's project
 * updates nothing rather than being moved.
 */
projects.post("/:id/sections/reorder", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
  if (!ids.length || ids.some((n) => !Number.isInteger(n)))
    throw new HTTPException(400, { message: "ids must be a non-empty array of section ids" });
  // A board with more columns than this is not a board. The cap is here because
  // the array length becomes the statement count in the batch below.
  if (ids.length > MAX_REORDER) throw new HTTPException(400, { message: "Too many sections" });

  await c.env.DB.batch(
    ids.map((sectionId, position) =>
      c.env.DB.prepare(
        "UPDATE sections SET position = ? WHERE id = ? AND project_id = ? AND user_id = ?",
      ).bind(position, sectionId, id, user.sub),
    ),
  );
  return c.json({ ok: true });
});

/** PATCH /api/projects/:id/sections/:sectionId — rename. */
projects.patch("/:id/sections/:sectionId", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const sectionId = Number(c.req.param("sectionId"));
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!Number.isInteger(id) || !Number.isInteger(sectionId))
    throw new HTTPException(400, { message: "Invalid id" });
  if (!name) throw new HTTPException(400, { message: "Section name is required" });

  const res = await c.env.DB.prepare(
    "UPDATE sections SET name = ? WHERE id = ? AND project_id = ? AND user_id = ?",
  )
    .bind(name, sectionId, id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Section not found" });
  return c.json({ ok: true });
});

/** DELETE /api/projects/:id/sections/:sectionId — its tasks fall back to no section. */
projects.delete("/:id/sections/:sectionId", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const sectionId = Number(c.req.param("sectionId"));
  if (!Number.isInteger(id) || !Number.isInteger(sectionId))
    throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare(
    "DELETE FROM sections WHERE id = ? AND project_id = ? AND user_id = ?",
  )
    .bind(sectionId, id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Section not found" });
  return c.json({ ok: true });
});

/** DELETE /api/projects/:id — its tasks fall back to Inbox (project_id -> NULL). */
projects.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Project not found" });
  return c.json({ ok: true });
});

export default projects;
