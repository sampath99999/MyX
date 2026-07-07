import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const folders = new Hono<AppBindings>();
folders.use("*", requireAuth);

interface FolderRow {
  id: number;
  name: string;
  color: string;
  position: number;
  created_at: string;
  note_count?: number;
}

/** GET /api/folders — with (non-archived) note counts. */
folders.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT f.id, f.name, f.color, f.position, f.created_at,
            (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.archived = 0) AS note_count
     FROM folders f WHERE f.user_id = ? ORDER BY f.position, f.id`,
  )
    .bind(user.sub)
    .all<FolderRow>();
  return c.json({ folders: results ?? [] });
});

/** POST /api/folders */
folders.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const color = body?.color ? String(body.color) : "#8b5cf6";
  if (!name) throw new HTTPException(400, { message: "Folder name is required" });

  const posRow = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM folders WHERE user_id = ?",
  )
    .bind(user.sub)
    .first<{ pos: number }>();

  const created = await c.env.DB.prepare(
    "INSERT INTO folders (user_id, name, color, position) VALUES (?, ?, ?, ?) RETURNING id, name, color, position, created_at",
  )
    .bind(user.sub, name, color, posRow?.pos ?? 0)
    .first<FolderRow>();
  return c.json({ folder: { ...created!, note_count: 0 } }, 201);
});

/** PATCH /api/folders/:id */
folders.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const folder = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<FolderRow>();
  if (!folder) throw new HTTPException(404, { message: "Folder not found" });

  const name = body?.name != null ? String(body.name).trim() : folder.name;
  const color = body?.color != null ? String(body.color) : folder.color;
  if (!name) throw new HTTPException(400, { message: "Folder name is required" });

  const updated = await c.env.DB.prepare(
    "UPDATE folders SET name = ?, color = ? WHERE id = ? AND user_id = ? RETURNING id, name, color, position, created_at",
  )
    .bind(name, color, id, user.sub)
    .first<FolderRow>();
  return c.json({ folder: updated });
});

/** DELETE /api/folders/:id — its notes fall back to no folder (uncategorized). */
folders.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Folder not found" });
  return c.json({ ok: true });
});

export default folders;
