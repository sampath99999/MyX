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
import { sendEmail, passwordResetEmail } from "../lib/email";
import {
  generateOtp,
  hashOtp,
  normalizeOtp,
  isWellFormedOtp,
  verificationEmail,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
} from "../lib/otp";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const auth = new Hono<AppBindings>();

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  token_version: number;
  email_verified: number;
  created_at: string;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tooMany(retryAfter: number): never {
  throw new HTTPException(429, {
    message: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
  });
}

/**
 * POST /api/auth/register — create an account, returns a JWT.
 *
 * MyX is single-user. The API is on a public URL, so leaving signup open let
 * anyone who found it create an account in the owner's database. Registration
 * now closes by itself as soon as the first account exists: the very first
 * request bootstraps the owner, and everything after it needs REGISTRATION_OPEN
 * set explicitly. That keeps a fresh deploy usable without a manual step.
 */
auth.post("/register", async (c) => {
  // Rate limit first: registration is unauthenticated and hashes a password.
  const ip = clientIp(c.req.raw.headers);
  const ipCheck = await consumeAttempt(c.env.DB, `register:ip:${ip}`, REGISTER_IP_RULE);
  if (!ipCheck.allowed) tooMany(ipCheck.retryAfter);

  if (c.env.REGISTRATION_OPEN !== "true") {
    const owner = await c.env.DB.prepare("SELECT 1 AS x FROM users LIMIT 1").first();
    if (owner) {
      throw new HTTPException(403, { message: "Registration is closed on this instance." });
    }
  }

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

  /*
    A code is issued at signup, but the account is usable immediately and the
    session is handed over as before. Blocking here would mean an outage in the
    mail path becomes an outage in signup — and worse, it would strand the
    person who just typed their password with no account and no way back.
    REQUIRE_VERIFIED_EMAIL is what turns this into a hard gate at login, once
    the sending domain is known good.
  */
  await issueVerificationCode(c.env, inserted.id, inserted.email);

  const token = await signToken(inserted, c.env.JWT_SECRET);
  return c.json(
    {
      token,
      user: {
        id: inserted.id,
        email: inserted.email,
        name: inserted.name,
        email_verified: false,
      },
    },
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
    "SELECT id, email, name, password_hash, token_version, email_verified, created_at FROM users WHERE email = ?",
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

  /*
    Sign-in deliberately succeeds even when the address is unverified. Blocking
    here would be a trap: entering the code needs a session, so a rejected login
    leaves the account permanently unverifiable. REQUIRE_VERIFIED_EMAIL is
    enforced on the data routes instead (see middleware.ts), which stops an
    unverified account from using MyX without stranding it.
  */

  const token = await signToken(user, c.env.JWT_SECRET);
  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      email_verified: Boolean(user.email_verified),
    },
  });
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
    "SELECT id, email, name, token_version, email_verified, digest_enabled, created_at FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first<{
      id: number;
      email: string;
      name: string;
      token_version: number;
      email_verified: number;
      digest_enabled: number;
      created_at: string;
    }>();
  if (!user) throw new HTTPException(404, { message: "User not found" });

  const body: Record<string, unknown> = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      email_verified: Boolean(user.email_verified),
      digest_enabled: Boolean(user.digest_enabled),
      created_at: user.created_at,
    },
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

/* ------------------------------------------------------------------ *
 * Password reset
 * ------------------------------------------------------------------ */

const RESET_TTL_SECONDS = 30 * 60;
/** Per-IP cap on reset requests — the send path is free to the attacker. */
const FORGOT_IP_RULE = { limit: 5, windowSeconds: 3600 };

/** SHA-256 hex. Only the digest of a reset token is ever stored. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * POST /api/auth/forgot — email a reset link.
 *
 * Answers 202 whether or not the address exists. Anything else turns this into
 * a free membership oracle: "no account with that email" tells a stranger which
 * of their leaked-credential addresses are worth attacking. The response is also
 * identical when the mail transport is unconfigured or fails, because none of
 * that is the requester's business either.
 */
auth.post("/forgot", async (c) => {
  const ip = clientIp(c.req.raw.headers);
  const ipCheck = await consumeAttempt(c.env.DB, `forgot:ip:${ip}`, FORGOT_IP_RULE);
  if (!ipCheck.allowed) tooMany(ipCheck.retryAfter);

  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const accepted = { message: "If that address has an account, a reset link is on its way." };
  if (!emailRe.test(email)) return c.json(accepted, 202);

  const user = await c.env.DB.prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string }>();
  if (!user) return c.json(accepted, 202);

  // 32 random bytes, base64url. The plaintext leaves this function only inside
  // the email body; the database sees the digest.
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    "INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await sha256Hex(token), user.id, now + RESET_TTL_SECONDS, now)
    .run();

  const base = (c.env.APP_URL ?? "https://myx.samchitech.com").replace(/\/$/, "");
  const link = `${base}/reset?token=${token}`;
  await sendEmail(c.env, { to: user.email, ...passwordResetEmail(link, RESET_TTL_SECONDS / 60) });

  return c.json(accepted, 202);
});

/**
 * POST /api/auth/reset — redeem a link and set a new password.
 *
 * Marks the row used inside the same statement that checks it, so two parallel
 * submissions of one link cannot both succeed. Also bumps token_version: whoever
 * triggered the reset may have been locked out by someone holding a live
 * session, and this strands every existing token for the account.
 */
auth.post("/reset", async (c) => {
  const body = await c.req.json().catch(() => null);
  const token = String(body?.token ?? "");
  const password = String(body?.password ?? "");

  const invalid = () => {
    throw new HTTPException(400, { message: "That reset link is invalid or has expired." });
  };

  if (!token) invalid();
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new HTTPException(400, {
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  if (password.length > MAX_PASSWORD_LENGTH)
    throw new HTTPException(400, { message: "Password is too long" });

  const now = Math.floor(Date.now() / 1000);
  const claimed = await c.env.DB.prepare(
    `UPDATE password_resets SET used_at = ?1
      WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1
      RETURNING user_id`,
  )
    .bind(now, await sha256Hex(token))
    .first<{ user_id: number }>();
  if (!claimed) invalid();

  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
  )
    .bind(await hashPassword(password), claimed!.user_id)
    .run();

  // Any other outstanding link for this account is now meaningless.
  await c.env.DB.prepare(
    "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
  )
    .bind(now, claimed!.user_id)
    .run();

  // A reset is a strong signal the account was in trouble, so it does not hand
  // back a session — the new password has to be used.
  return c.json({ ok: true });
});

/**
 * DELETE /api/auth/account — erase the account and everything in it.
 *
 * Requires the current password: a stolen token should not be enough to destroy
 * someone's records. Every table's user_id carries ON DELETE CASCADE, so this
 * one statement removes the transactions, tasks, notes, checklists and the rest.
 */
auth.delete("/account", requireAuth, async (c) => {
  const payload = c.get("user");
  const body = await c.req.json().catch(() => null);
  const password = String(body?.password ?? "");

  const user = await c.env.DB.prepare("SELECT id, password_hash FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<{ id: number; password_hash: string }>();
  if (!user) throw new HTTPException(404, { message: "Account not found" });

  const ok =
    password.length > 0 &&
    password.length <= MAX_PASSWORD_LENGTH &&
    (await verifyPassword(password, user.password_hash));
  if (!ok) throw new HTTPException(403, { message: "Password is incorrect" });

  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Email verification
 * ------------------------------------------------------------------ */

/** Per-user cap on how often a new code can be requested. */
const RESEND_RULE = { limit: 5, windowSeconds: 3600 };

/**
 * Create (or replace) this user's code and email it.
 *
 * Replacing rather than adding is the point: several live codes would multiply
 * an attacker's chances by the number outstanding, and the attempt counter has
 * to reset with the code or a resend would inherit a spent budget.
 */
async function issueVerificationCode(env: AppBindings["Bindings"], userId: number, email: string) {
  const code = generateOtp();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO email_otps (user_id, code_hash, expires_at, attempts, created_at)
     VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT (user_id)
     DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, created_at = ?4`,
  )
    .bind(userId, await hashOtp(code), now + OTP_TTL_SECONDS, now)
    .run();

  await sendEmail(env, { to: email, ...verificationEmail(code, OTP_TTL_SECONDS / 60) });
}

/**
 * POST /api/auth/verify-email — confirm the address with the emailed code.
 *
 * The attempt counter is incremented *before* the code is compared, so a wrong
 * guess costs the attacker a try whether or not the request completes. Six
 * digits is only a million possibilities; the cap is what makes that safe.
 */
auth.post("/verify-email", requireAuth, async (c) => {
  const payload = c.get("user");
  const body = await c.req.json().catch(() => null);
  const code = normalizeOtp(body?.code);

  const wrong = () => {
    throw new HTTPException(400, { message: "That code is incorrect or has expired." });
  };
  if (!isWellFormedOtp(code)) wrong();

  const now = Math.floor(Date.now() / 1000);
  const row = await c.env.DB.prepare(
    `UPDATE email_otps SET attempts = attempts + 1
      WHERE user_id = ?1 AND expires_at > ?2 AND attempts < ?3
      RETURNING code_hash`,
  )
    .bind(payload.sub, now, OTP_MAX_ATTEMPTS)
    .first<{ code_hash: string }>();

  // No row means no code, expired, or the guess budget is gone. All the same
  // message — telling them which one is free information.
  if (!row) wrong();
  if (row!.code_hash !== (await hashOtp(code))) wrong();

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(payload.sub),
    c.env.DB.prepare("DELETE FROM email_otps WHERE user_id = ?").bind(payload.sub),
  ]);

  return c.json({ ok: true, email_verified: true });
});

/** POST /api/auth/verify-email/resend — issue a fresh code, invalidating the old. */
auth.post("/verify-email/resend", requireAuth, async (c) => {
  const payload = c.get("user");

  const check = await consumeAttempt(c.env.DB, `verify:user:${payload.sub}`, RESEND_RULE);
  if (!check.allowed) tooMany(check.retryAfter);

  const user = await c.env.DB.prepare(
    "SELECT id, email, email_verified FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first<{ id: number; email: string; email_verified: number }>();
  if (!user) throw new HTTPException(404, { message: "Account not found" });

  // Already done — say so plainly rather than sending a pointless email.
  if (user.email_verified) return c.json({ ok: true, email_verified: true });

  await issueVerificationCode(c.env, user.id, user.email);
  return c.json({ ok: true, email_verified: false });
});

/**
 * PATCH /api/auth/preferences — currently just the daily digest opt-out.
 *
 * A reminder that lands in someone's mailbox needs a switch that is one click
 * away, not a support request.
 */
auth.patch("/preferences", requireAuth, async (c) => {
  const payload = c.get("user");
  const body = await c.req.json().catch(() => null);

  if (typeof body?.digest_enabled !== "boolean") {
    throw new HTTPException(400, { message: "digest_enabled must be true or false" });
  }

  await c.env.DB.prepare("UPDATE users SET digest_enabled = ? WHERE id = ?")
    .bind(body.digest_enabled ? 1 : 0, payload.sub)
    .run();

  return c.json({ ok: true, digest_enabled: body.digest_enabled });
});

export default auth;
