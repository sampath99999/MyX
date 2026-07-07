import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const checklists = new Hono<AppBindings>();
checklists.use("*", requireAuth);

interface ChecklistRow {
  id: number;
  name: string;
  emoji: string | null;
  position: number;
  created_at: string;
}

interface ChecklistItemRow {
  id: number;
  checklist_id: number;
  title: string;
  done: number;
  position: number;
  created_at: string;
}

async function ownedChecklist(db: D1Database, id: number, userId: number) {
  const checklist = await db
    .prepare("SELECT * FROM checklists WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<ChecklistRow>();
  if (!checklist) throw new HTTPException(404, { message: "Checklist not found" });
  return checklist;
}

/** GET /api/checklists — list with item progress (total/done). */
checklists.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT ch.*,
            COUNT(i.id) AS total,
            COALESCE(SUM(i.done), 0) AS done
     FROM checklists ch
     LEFT JOIN checklist_items i ON i.checklist_id = ch.id
     WHERE ch.user_id = ?
     GROUP BY ch.id
     ORDER BY ch.position ASC, ch.created_at ASC`,
  )
    .bind(user.sub)
    .all<ChecklistRow & { total: number; done: number }>();

  return c.json({
    checklists: (results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      position: r.position,
      total: r.total,
      done: r.done,
      created_at: r.created_at,
    })),
  });
});

/** POST /api/checklists — create. Body: { name, emoji? } */
checklists.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const emoji = body?.emoji ? String(body.emoji).trim().slice(0, 8) : null;
  if (!name) throw new HTTPException(400, { message: "Checklist name is required" });

  const created = await c.env.DB.prepare(
    "INSERT INTO checklists (user_id, name, emoji) VALUES (?, ?, ?) RETURNING *",
  )
    .bind(user.sub, name, emoji)
    .first<ChecklistRow>();
  if (!created) throw new HTTPException(500, { message: "Failed to create checklist" });
  return c.json({ checklist: { ...created, total: 0, done: 0 } }, 201);
});

/** GET /api/checklists/:id — checklist + its items. */
checklists.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const checklist = await ownedChecklist(c.env.DB, id, user.sub);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY position ASC, id ASC",
  )
    .bind(id)
    .all<ChecklistItemRow>();

  return c.json({
    checklist,
    items: (results ?? []).map((i) => ({
      id: i.id,
      title: i.title,
      done: i.done === 1,
      position: i.position,
    })),
  });
});

/** PATCH /api/checklists/:id — edit name / emoji. */
checklists.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const existing = await ownedChecklist(c.env.DB, id, user.sub);
  const name = body?.name != null ? String(body.name).trim() : existing.name;
  const emoji =
    body?.emoji !== undefined ? (body.emoji ? String(body.emoji).slice(0, 8) : null) : existing.emoji;
  if (!name) throw new HTTPException(400, { message: "Checklist name is required" });

  const updated = await c.env.DB.prepare(
    "UPDATE checklists SET name = ?, emoji = ? WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(name, emoji, id, user.sub)
    .first<ChecklistRow>();
  return c.json({ checklist: updated });
});

/** DELETE /api/checklists/:id */
checklists.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM checklists WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Checklist not found" });
  return c.json({ ok: true });
});

/** POST /api/checklists/:id/reset — uncheck every item (start a new run). */
checklists.post("/:id/reset", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  await ownedChecklist(c.env.DB, id, user.sub);
  await c.env.DB.prepare("UPDATE checklist_items SET done = 0 WHERE checklist_id = ?").bind(id).run();
  return c.json({ ok: true });
});

/** POST /api/checklists/:id/items — add an item. Body: { title } */
checklists.post("/:id/items", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  await ownedChecklist(c.env.DB, id, user.sub);
  const title = String(body?.title ?? "").trim();
  if (!title) throw new HTTPException(400, { message: "Item title is required" });

  const maxPos = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) AS max FROM checklist_items WHERE checklist_id = ?",
  )
    .bind(id)
    .first<{ max: number }>();

  const created = await c.env.DB.prepare(
    "INSERT INTO checklist_items (checklist_id, title, position) VALUES (?, ?, ?) RETURNING *",
  )
    .bind(id, title, (maxPos?.max ?? -1) + 1)
    .first<ChecklistItemRow>();
  if (!created) throw new HTTPException(500, { message: "Failed to add item" });
  return c.json({ item: { id: created.id, title: created.title, done: false, position: created.position } }, 201);
});

/** PATCH /api/checklists/:id/items/:itemId — edit title / toggle done. */
checklists.patch("/:id/items/:itemId", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id) || !Number.isInteger(itemId))
    throw new HTTPException(400, { message: "Invalid id" });

  await ownedChecklist(c.env.DB, id, user.sub);
  const existing = await c.env.DB.prepare(
    "SELECT * FROM checklist_items WHERE id = ? AND checklist_id = ?",
  )
    .bind(itemId, id)
    .first<ChecklistItemRow>();
  if (!existing) throw new HTTPException(404, { message: "Item not found" });

  const title = body?.title != null ? String(body.title).trim() : existing.title;
  const done = body?.done != null ? (body.done ? 1 : 0) : existing.done;
  if (!title) throw new HTTPException(400, { message: "Item title is required" });

  const updated = await c.env.DB.prepare(
    "UPDATE checklist_items SET title = ?, done = ? WHERE id = ? AND checklist_id = ? RETURNING *",
  )
    .bind(title, done, itemId, id)
    .first<ChecklistItemRow>();
  return c.json({ item: { id: updated!.id, title: updated!.title, done: updated!.done === 1, position: updated!.position } });
});

/** DELETE /api/checklists/:id/items/:itemId */
checklists.delete("/:id/items/:itemId", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const itemId = Number(c.req.param("itemId"));
  if (!Number.isInteger(id) || !Number.isInteger(itemId))
    throw new HTTPException(400, { message: "Invalid id" });

  await ownedChecklist(c.env.DB, id, user.sub);
  const res = await c.env.DB.prepare(
    "DELETE FROM checklist_items WHERE id = ? AND checklist_id = ?",
  )
    .bind(itemId, id)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Item not found" });
  return c.json({ ok: true });
});

export default checklists;
