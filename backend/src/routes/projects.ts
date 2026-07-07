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
  if (!name) throw new HTTPException(400, { message: "Project name is required" });

  const updated = await c.env.DB.prepare(
    "UPDATE projects SET name = ?, color = ?, archived = ? WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(name, color, archived, id, user.sub)
    .first<ProjectRow>();
  return c.json({ project: serialize(updated!) });
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
