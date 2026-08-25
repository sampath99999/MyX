import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import {
  displayPrefix,
  generateApiKey,
  hashApiKey,
  isApiKeyScope,
  MAX_KEYS_PER_USER,
} from "../lib/apikeys";
import type { AppBindings } from "../types";

/*
  Managing API keys. Reachable only with a real session: requireAuth's deny-list
  bars a key from /api/keys, so no key can mint or revoke another.
*/

const keys = new Hono<AppBindings>();
keys.use("*", requireAuth);

interface KeyRow {
  id: number;
  name: string;
  prefix: string;
  scope: string;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
}

/** Ten years. Long enough to mean "no expiry" for anyone who wants a number. */
const MAX_EXPIRY_DAYS = 3650;
const MAX_NAME_LENGTH = 60;

/** GET /api/keys — the list. Never includes the key itself; we do not have it. */
keys.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, prefix, scope, created_at, last_used_at, expires_at
       FROM api_keys WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
  )
    .bind(user.sub)
    .all<KeyRow>();

  return c.json({ keys: results ?? [], max: MAX_KEYS_PER_USER });
});

/**
 * POST /api/keys — mint one.
 *
 * The response carries the plaintext key, and it is the only response that ever
 * will: what goes in the table is a SHA-256 of it. Losing it means making a new
 * one, which is the correct trade and the reason the UI makes such a noise about
 * copying it.
 */
keys.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const name = String(body?.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new HTTPException(400, { message: "Give the key a name" });

  const scope = body?.scope ?? "write";
  if (!isApiKeyScope(scope)) {
    throw new HTTPException(400, { message: "scope must be 'read' or 'write'" });
  }

  let expiresAt: number | null = null;
  if (body?.expires_in_days != null) {
    const days = Number(body.expires_in_days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
      throw new HTTPException(400, {
        message: `expires_in_days must be a whole number of days between 1 and ${MAX_EXPIRY_DAYS}`,
      });
    }
    expiresAt = Math.floor(Date.now() / 1000) + days * 86_400;
  }

  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ?")
    .bind(user.sub)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_KEYS_PER_USER) {
    throw new HTTPException(400, {
      message: `You already have ${MAX_KEYS_PER_USER} keys. Revoke one to create another.`,
    });
  }

  const token = generateApiKey();
  const created = await c.env.DB.prepare(
    `INSERT INTO api_keys (user_id, name, key_hash, prefix, scope, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id, name, prefix, scope, created_at, last_used_at, expires_at`,
  )
    .bind(
      user.sub,
      name,
      await hashApiKey(token),
      displayPrefix(token),
      scope,
      Math.floor(Date.now() / 1000),
      expiresAt,
    )
    .first<KeyRow>();

  if (!created) throw new HTTPException(500, { message: "Failed to create the key" });
  return c.json({ key: created, token }, 201);
});

/** DELETE /api/keys/:id — revoke. The row goes; the key stops working at once. */
keys.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Key not found" });
  return c.json({ ok: true });
});

export default keys;
