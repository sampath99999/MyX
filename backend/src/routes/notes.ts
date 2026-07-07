import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const notes = new Hono<AppBindings>();
notes.use("*", requireAuth);

interface NoteRow {
  id: number;
  folder_id: number | null;
  title: string;
  content: string;
  tags: string;
  pinned: number;
  color: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

const splitTags = (s: string): string[] =>
  s.split(",").map((t) => t.trim()).filter(Boolean);

const joinTags = (arr: unknown): string => {
  if (!Array.isArray(arr)) return "";
  return [...new Set(arr.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean))].join(",");
};

/** Strip light markdown to build a plain-text snippet. */
function snippet(content: string, len = 180): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > len ? plain.slice(0, len) + "…" : plain;
}

function listItem(n: NoteRow) {
  return {
    id: n.id,
    folder_id: n.folder_id,
    title: n.title,
    snippet: snippet(n.content),
    tags: splitTags(n.tags),
    pinned: n.pinned === 1,
    color: n.color,
    archived: n.archived === 1,
    updated_at: n.updated_at,
  };
}

function fullNote(n: NoteRow) {
  return {
    id: n.id,
    folder_id: n.folder_id,
    title: n.title,
    content: n.content,
    tags: splitTags(n.tags),
    pinned: n.pinned === 1,
    color: n.color,
    archived: n.archived === 1,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

/** GET /api/notes/tags — distinct tags across active notes. */
notes.get("/tags", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT tags FROM notes WHERE user_id = ? AND archived = 0 AND tags != ''",
  )
    .bind(user.sub)
    .all<{ tags: string }>();
  const set = new Set<string>();
  for (const r of results ?? []) splitTags(r.tags).forEach((t) => set.add(t));
  return c.json({ tags: [...set].sort((a, b) => a.localeCompare(b)) });
});

/** GET /api/notes?folder_id=&view=pinned|trash&tag=&q= — list (metadata + snippet). */
notes.get("/", async (c) => {
  const user = c.get("user");
  const folderId = c.req.query("folder_id");
  const view = c.req.query("view");
  const tag = c.req.query("tag");
  const q = c.req.query("q");

  const where: string[] = ["user_id = ?"];
  const binds: unknown[] = [user.sub];

  if (view === "trash") {
    where.push("archived = 1");
  } else {
    where.push("archived = 0");
    if (view === "pinned") where.push("pinned = 1");
    if (folderId) {
      where.push("folder_id = ?");
      binds.push(Number(folderId));
    }
  }
  if (tag) {
    where.push("(',' || tags || ',') LIKE ?");
    binds.push(`%,${tag},%`);
  }
  if (q) {
    where.push("(title LIKE ? OR content LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM notes WHERE ${where.join(" AND ")}
     ORDER BY pinned DESC, updated_at DESC, id DESC`,
  )
    .bind(...binds)
    .all<NoteRow>();
  return c.json({ notes: (results ?? []).map(listItem) });
});

/** GET /api/notes/:id — full note. */
notes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const note = await c.env.DB.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<NoteRow>();
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  return c.json({ note: fullNote(note) });
});

/** POST /api/notes — create. */
notes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  const content = String(body?.content ?? "");
  const folder_id = body?.folder_id != null ? Number(body.folder_id) : null;
  const tags = joinTags(body?.tags);

  const created = await c.env.DB.prepare(
    "INSERT INTO notes (user_id, folder_id, title, content, tags) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(user.sub, folder_id, title, content, tags)
    .first<NoteRow>();
  return c.json({ note: fullNote(created!) }, 201);
});

/** PATCH /api/notes/:id — update fields; bumps updated_at. */
notes.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const note = await c.env.DB.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<NoteRow>();
  if (!note) throw new HTTPException(404, { message: "Note not found" });

  const title = body?.title != null ? String(body.title) : note.title;
  const content = body?.content != null ? String(body.content) : note.content;
  const folder_id =
    body?.folder_id !== undefined
      ? body.folder_id === null
        ? null
        : Number(body.folder_id)
      : note.folder_id;
  const tags = body?.tags !== undefined ? joinTags(body.tags) : note.tags;
  const pinned = body?.pinned != null ? (body.pinned ? 1 : 0) : note.pinned;
  const color = body?.color !== undefined ? (body.color ? String(body.color) : null) : note.color;
  const archived = body?.archived != null ? (body.archived ? 1 : 0) : note.archived;

  const updated = await c.env.DB.prepare(
    `UPDATE notes SET title=?, content=?, folder_id=?, tags=?, pinned=?, color=?, archived=?,
       updated_at=datetime('now') WHERE id=? AND user_id=? RETURNING *`,
  )
    .bind(title, content, folder_id, tags, pinned, color, archived, id, user.sub)
    .first<NoteRow>();
  return c.json({ note: fullNote(updated!) });
});

/** DELETE /api/notes/:id — permanent delete. */
notes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Note not found" });
  return c.json({ ok: true });
});

export default notes;
