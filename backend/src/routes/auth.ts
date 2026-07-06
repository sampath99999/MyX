import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { hashPassword, verifyPassword, signToken } from "../lib/auth";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const auth = new Hono<AppBindings>();

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/auth/register — create an account, returns a JWT. */
auth.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim();
  const password = String(body?.password ?? "");

  if (!emailRe.test(email)) throw new HTTPException(400, { message: "Invalid email address" });
  if (name.length < 1) throw new HTTPException(400, { message: "Name is required" });
  if (password.length < 8)
    throw new HTTPException(400, { message: "Password must be at least 8 characters" });

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) throw new HTTPException(409, { message: "An account with this email already exists" });

  const password_hash = await hashPassword(password);
  const inserted = await c.env.DB.prepare(
    "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?) RETURNING id, email, name",
  )
    .bind(email, name, password_hash)
    .first<{ id: number; email: string; name: string }>();

  if (!inserted) throw new HTTPException(500, { message: "Failed to create account" });

  const token = await signToken(inserted, c.env.JWT_SECRET);
  return c.json({ token, user: inserted }, 201);
});

/** POST /api/auth/login — verify credentials, returns a JWT. */
auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) throw new HTTPException(400, { message: "Email and password are required" });

  const user = await c.env.DB.prepare(
    "SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?",
  )
    .bind(email)
    .first<UserRow>();

  // Same error for missing user / wrong password to avoid user enumeration.
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) throw new HTTPException(401, { message: "Invalid email or password" });

  const token = await signToken(user, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

/** GET /api/auth/me — current user from the JWT. */
auth.get("/me", requireAuth, async (c) => {
  const payload = c.get("user");
  const user = await c.env.DB.prepare(
    "SELECT id, email, name, created_at FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first();
  if (!user) throw new HTTPException(404, { message: "User not found" });
  return c.json({ user });
});

export default auth;
