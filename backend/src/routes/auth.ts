import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  hashPassword,
  verifyPassword,
  signToken,
  shouldRenew,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../lib/auth";
import {
  consumeAttempt,
  peekAttempts,
  resetAttempts,
  pruneExpired,
  clientIp,
  LOGIN_IP_RULE,
  LOGIN_EMAIL_RULE,
  REGISTER_IP_RULE,
} from "../lib/ratelimit";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const auth = new Hono<AppBindings>();

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  token_version: number;
  created_at: string;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tooMany(retryAfter: number): never {
  throw new HTTPException(429, {
    message: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
  });
}

/** POST /api/auth/register — create an account, returns a JWT. */
auth.post("/register", async (c) => {
  // Rate limit first: registration is unauthenticated and hashes a password.
  const ip = clientIp(c.req.raw.headers);
  const ipCheck = await consumeAttempt(c.env.DB, `register:ip:${ip}`, REGISTER_IP_RULE);
  if (!ipCheck.allowed) tooMany(ipCheck.retryAfter);

  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim();
  const password = String(body?.password ?? "");

  if (!emailRe.test(email)) throw new HTTPException(400, { message: "Invalid email address" });
  if (name.length < 1) throw new HTTPException(400, { message: "Name is required" });
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new HTTPException(400, {
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  // Checked before hashing — an unbounded password is a CPU-exhaustion vector.
  if (password.length > MAX_PASSWORD_LENGTH)
    throw new HTTPException(400, {
      message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    });

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) throw new HTTPException(409, { message: "An account with this email already exists" });

  const password_hash = await hashPassword(password);
  const inserted = await c.env.DB.prepare(
    "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?) RETURNING id, email, name, token_version",
  )
    .bind(email, name, password_hash)
    .first<{ id: number; email: string; name: string; token_version: number }>();

  if (!inserted) throw new HTTPException(500, { message: "Failed to create account" });

  const token = await signToken(inserted, c.env.JWT_SECRET);
  return c.json(
    { token, user: { id: inserted.id, email: inserted.email, name: inserted.name } },
    201,
  );
});

/** POST /api/auth/login — verify credentials, returns a JWT. */
auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) throw new HTTPException(400, { message: "Email and password are required" });

  // --- Rate limiting, before any hashing ---
  // IP bucket counts every attempt: it is the flood gate and the CPU guard.
  const ip = clientIp(c.req.raw.headers);
  const ipCheck = await consumeAttempt(c.env.DB, `login:ip:${ip}`, LOGIN_IP_RULE);
  if (!ipCheck.allowed) tooMany(ipCheck.retryAfter);

  // Email bucket counts only failures (incremented below) so it catches a spray
  // across many IPs. Trade-off: someone who knows an address can burn its budget
  // and lock that account out for the window. The IP limit is the tighter of the
  // two in practice, and a successful login clears this bucket immediately.
  const emailKey = `login:email:${email}`;
  const failures = await peekAttempts(c.env.DB, emailKey, LOGIN_EMAIL_RULE);
  if (failures >= LOGIN_EMAIL_RULE.limit) tooMany(LOGIN_EMAIL_RULE.windowSeconds);

  // Oversized passwords are rejected before pbkdf2() rather than after.
  if (password.length > MAX_PASSWORD_LENGTH)
    throw new HTTPException(401, { message: "Invalid email or password" });

  const user = await c.env.DB.prepare(
    "SELECT id, email, name, password_hash, token_version, created_at FROM users WHERE email = ?",
  )
    .bind(email)
    .first<UserRow>();

  // Same error for missing user / wrong password to avoid user enumeration.
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) {
    await consumeAttempt(c.env.DB, emailKey, LOGIN_EMAIL_RULE);
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  // Clear both buckets so an honest user who mistyped a few times isn't stuck.
  await resetAttempts(c.env.DB, emailKey);
  await resetAttempts(c.env.DB, `login:ip:${ip}`);

  // Opportunistic cleanup on the (rare) success path keeps the table bounded.
  // Hono's executionCtx getter *throws* when there is no ExecutionContext
  // rather than returning undefined, so optional chaining is not enough.
  try {
    c.executionCtx.waitUntil(pruneExpired(c.env.DB));
  } catch {
    // No execution context (tests, some runtimes) — prune inline and ignore
    // failures; this is housekeeping, never a reason to fail a login.
    await pruneExpired(c.env.DB).catch(() => {});
  }

  const token = await signToken(user, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

/**
 * GET /api/auth/me — current user from the JWT.
 *
 * Also slides the session: once a token is past halfway through its life this
 * returns a fresh one, so a 24h TTL never forces an active user to sign in again
 * while still bounding how long a stolen token stays useful.
 */
auth.get("/me", requireAuth, async (c) => {
  const payload = c.get("user");
  const user = await c.env.DB.prepare(
    "SELECT id, email, name, token_version, created_at FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first<{
      id: number;
      email: string;
      name: string;
      token_version: number;
      created_at: string;
    }>();
  if (!user) throw new HTTPException(404, { message: "User not found" });

  const body: Record<string, unknown> = {
    user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
  };
  if (shouldRenew(payload)) {
    body.token = await signToken(user, c.env.JWT_SECRET);
  }
  return c.json(body);
});

/**
 * POST /api/auth/logout — actually revokes the caller's tokens.
 *
 * Clearing localStorage alone left the JWT valid until it expired. Bumping
 * token_version strands every token already issued for this user, on every
 * device, immediately.
 */
auth.post("/logout", requireAuth, async (c) => {
  const payload = c.get("user");
  await c.env.DB.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?")
    .bind(payload.sub)
    .run();
  return c.json({ ok: true });
});

export default auth;
