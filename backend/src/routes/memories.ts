import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const memories = new Hono<AppBindings>();
memories.use("*", requireAuth);

interface MemoryRow {
  id: number;
  title: string;
  note: string;
  emoji: string | null;
  occurred_on: string | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

const splitTags = (s: string): string[] => s.split(",").map((t) => t.trim()).filter(Boolean);

const joinTags = (arr: unknown): string => {
  if (!Array.isArray(arr)) return "";
  return [...new Set(arr.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean))].join(",");
};

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function serialize(m: MemoryRow) {
  return {
    id: m.id,
    title: m.title,
    note: m.note,
    emoji: m.emoji,
    occurred_on: m.occurred_on,
    tags: splitTags(m.tags),
    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}

/** GET /api/memories/tags — distinct tags across all memories. */
memories.get("/tags", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT tags FROM memories WHERE user_id = ? AND tags != ''",
  )
    .bind(user.sub)
    .all<{ tags: string }>();
  const set = new Set<string>();
  for (const r of results ?? []) splitTags(r.tags).forEach((t) => set.add(t));
  return c.json({ tags: [...set].sort((a, b) => a.localeCompare(b)) });
});

/** GET /api/memories?tag=&q= — list, most recent first. */
memories.get("/", async (c) => {
  const user = c.get("user");
  const tag = c.req.query("tag");
  const q = c.req.query("q");

  const where: string[] = ["user_id = ?"];
  const binds: unknown[] = [user.sub];

  if (tag) {
    where.push("(',' || tags || ',') LIKE ?");
    binds.push(`%,${tag},%`);
  }
  if (q) {
    where.push("(title LIKE ? OR note LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM memories WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(occurred_on, substr(created_at, 1, 10)) DESC, id DESC`,
  )
    .bind(...binds)
    .all<MemoryRow>();
  return c.json({ memories: (results ?? []).map(serialize) });
});

/** POST /api/memories — create. Body: { title, note?, emoji?, occurred_on?, tags? } */
memories.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const title = String(body?.title ?? "").trim();
  const note = String(body?.note ?? "");
  const emoji = body?.emoji ? String(body.emoji).trim().slice(0, 8) : null;
  const occurred_on = body?.occurred_on ? String(body.occurred_on) : null;
  const tags = joinTags(body?.tags);

  if (!title) throw new HTTPException(400, { message: "Title is required" });
  if (occurred_on && !dateRe.test(occurred_on))
    throw new HTTPException(400, { message: "occurred_on must be YYYY-MM-DD" });

  const created = await c.env.DB.prepare(
    `INSERT INTO memories (user_id, title, note, emoji, occurred_on, tags)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(user.sub, title, note, emoji, occurred_on, tags)
    .first<MemoryRow>();
  if (!created) throw new HTTPException(500, { message: "Failed to create memory" });
  return c.json({ memory: serialize(created) }, 201);
});

/** PATCH /api/memories/:id — edit any field. */
memories.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const existing = await c.env.DB.prepare("SELECT * FROM memories WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<MemoryRow>();
  if (!existing) throw new HTTPException(404, { message: "Memory not found" });

  const title = body?.title != null ? String(body.title).trim() : existing.title;
  const note = body?.note != null ? String(body.note) : existing.note;
  const emoji =
    body?.emoji !== undefined ? (body.emoji ? String(body.emoji).slice(0, 8) : null) : existing.emoji;
  const occurred_on =
    body?.occurred_on !== undefined ? (body.occurred_on || null) : existing.occurred_on;
  const tags = body?.tags !== undefined ? joinTags(body.tags) : existing.tags;

  if (!title) throw new HTTPException(400, { message: "Title is required" });
  if (occurred_on && !dateRe.test(occurred_on))
    throw new HTTPException(400, { message: "occurred_on must be YYYY-MM-DD" });

  const updated = await c.env.DB.prepare(
    `UPDATE memories SET title = ?, note = ?, emoji = ?, occurred_on = ?, tags = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(title, note, emoji, occurred_on, tags, id, user.sub)
    .first<MemoryRow>();
  return c.json({ memory: serialize(updated!) });
});

/** DELETE /api/memories/:id */
memories.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Memory not found" });
  return c.json({ ok: true });
});

export default memories;
