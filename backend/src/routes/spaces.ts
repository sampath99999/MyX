import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const spaces = new Hono<AppBindings>();
spaces.use("*", requireAuth);

interface SpaceRow {
  id: number;
  name: string;
  color: string;
  icon: string;
  position: number;
  created_at: string;
}

// Seeded for a brand-new user on first load.
const DEFAULT_SPACES = [
  { name: "Personal", color: "#8b5cf6", icon: "🏠" },
  { name: "Work", color: "#3b82f6", icon: "💼" },
];

/** GET /api/spaces — list; seeds Personal + Work on first use. */
spaces.get("/", async (c) => {
  const user = c.get("user");

  let { results } = await c.env.DB.prepare(
    "SELECT id, name, color, icon, position, created_at FROM spaces WHERE user_id = ? ORDER BY position, id",
  )
    .bind(user.sub)
    .all<SpaceRow>();

  if (!results || results.length === 0) {
    await c.env.DB.batch(
      DEFAULT_SPACES.map((s, i) =>
        c.env.DB.prepare(
          "INSERT INTO spaces (user_id, name, color, icon, position) VALUES (?, ?, ?, ?, ?)",
        ).bind(user.sub, s.name, s.color, s.icon, i),
      ),
    );
    const seeded = await c.env.DB.prepare(
      "SELECT id, name, color, icon, position, created_at FROM spaces WHERE user_id = ? ORDER BY position, id",
    )
      .bind(user.sub)
      .all<SpaceRow>();
    results = seeded.results;
  }

  return c.json({ spaces: results ?? [] });
});

/** POST /api/spaces — create a space. */
spaces.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const color = body?.color ? String(body.color) : "#8b5cf6";
  const icon = body?.icon ? String(body.icon).slice(0, 8) : "🗂️";
  if (!name) throw new HTTPException(400, { message: "Space name is required" });

  const posRow = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM spaces WHERE user_id = ?",
  )
    .bind(user.sub)
    .first<{ pos: number }>();

  const created = await c.env.DB.prepare(
    "INSERT INTO spaces (user_id, name, color, icon, position) VALUES (?, ?, ?, ?, ?) RETURNING id, name, color, icon, position, created_at",
  )
    .bind(user.sub, name, color, icon, posRow?.pos ?? 0)
    .first<SpaceRow>();
  return c.json({ space: created }, 201);
});

/** PATCH /api/spaces/:id — rename / recolor / re-icon. */
spaces.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const space = await c.env.DB.prepare("SELECT * FROM spaces WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<SpaceRow>();
  if (!space) throw new HTTPException(404, { message: "Space not found" });

  const name = body?.name != null ? String(body.name).trim() : space.name;
  const color = body?.color != null ? String(body.color) : space.color;
  const icon = body?.icon != null ? String(body.icon).slice(0, 8) : space.icon;
  if (!name) throw new HTTPException(400, { message: "Space name is required" });

  const updated = await c.env.DB.prepare(
    "UPDATE spaces SET name = ?, color = ?, icon = ? WHERE id = ? AND user_id = ? RETURNING id, name, color, icon, position, created_at",
  )
    .bind(name, color, icon, id, user.sub)
    .first<SpaceRow>();
  return c.json({ space: updated });
});

/** DELETE /api/spaces/:id — removes its projects & tasks too (FK cascade). */
spaces.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM spaces WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Space not found" });
  return c.json({ ok: true });
});

export default spaces;
