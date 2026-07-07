import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const labels = new Hono<AppBindings>();
labels.use("*", requireAuth);

interface LabelRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

/** GET /api/labels */
labels.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, color, created_at FROM labels WHERE user_id = ? ORDER BY name",
  )
    .bind(user.sub)
    .all<LabelRow>();
  return c.json({ labels: results ?? [] });
});

/** POST /api/labels — create (idempotent-ish: returns existing on duplicate name). */
labels.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().replace(/^#/, "");
  const color = body?.color ? String(body.color) : "#8b5cf6";
  if (!name) throw new HTTPException(400, { message: "Label name is required" });

  const existing = await c.env.DB.prepare("SELECT id, name, color, created_at FROM labels WHERE user_id = ? AND name = ?")
    .bind(user.sub, name)
    .first<LabelRow>();
  if (existing) return c.json({ label: existing });

  const created = await c.env.DB.prepare(
    "INSERT INTO labels (user_id, name, color) VALUES (?, ?, ?) RETURNING id, name, color, created_at",
  )
    .bind(user.sub, name, color)
    .first<LabelRow>();
  return c.json({ label: created }, 201);
});

/** PATCH /api/labels/:id */
labels.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const label = await c.env.DB.prepare("SELECT * FROM labels WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LabelRow>();
  if (!label) throw new HTTPException(404, { message: "Label not found" });

  const name = body?.name != null ? String(body.name).trim().replace(/^#/, "") : label.name;
  const color = body?.color != null ? String(body.color) : label.color;
  if (!name) throw new HTTPException(400, { message: "Label name is required" });

  const updated = await c.env.DB.prepare(
    "UPDATE labels SET name = ?, color = ? WHERE id = ? AND user_id = ? RETURNING id, name, color, created_at",
  )
    .bind(name, color, id, user.sub)
    .first<LabelRow>();
  return c.json({ label: updated });
});

/** DELETE /api/labels/:id */
labels.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM labels WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Label not found" });
  return c.json({ ok: true });
});

export default labels;
