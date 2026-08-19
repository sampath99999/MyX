import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import { sendEmail } from "../lib/email";
import { generateOtp, hashOtp, normalizeOtp, isWellFormedOtp } from "../lib/otp";
import type { AppBindings } from "../types";

/*
  Owner-only view of how the app is behaving.

  Three things keep this private, in increasing order of how much they matter:

  1. The path is unlinked and excluded from robots.txt and the prerender list,
     so nothing public mentions it exists.
  2. Every route here answers 404 rather than 401/403 to anyone who is not an
     admin. A 403 confirms there is something to find.
  3. is_admin is set by hand in D1. There is no endpoint that grants it, so a
     bug in this file cannot promote anyone.

  On top of that, opening the screens needs a fresh emailed code: a stolen
  session should not be enough to read how many users exist and what is failing.

  Deliberately absent: any way to read a user's transactions, notes or
  memories. Counts and errors only. The privacy page says data is scoped to the
  account that owns it, and an admin screen that could browse it would make that
  untrue.
*/

const admin = new Hono<AppBindings>();
admin.use("*", requireAuth);

const UNLOCK_TTL_SECONDS = 10 * 60; // life of the emailed code
const SESSION_TTL_SECONDS = 30 * 60; // how long the screens stay open
const MAX_UNLOCK_ATTEMPTS = 5;

const now = () => Math.floor(Date.now() / 1000);

/** Everything an outsider sees. Never 403 — that would confirm the route exists. */
function notFound(): never {
  throw new HTTPException(404, { message: "Not found" });
}

async function assertAdmin(c: Context<AppBindings>) {
  const payload = c.get("user");
  const row = await c.env.DB.prepare("SELECT is_admin FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<{ is_admin: number }>();
  if (!row?.is_admin) notFound();
  return payload.sub;
}

async function assertUnlocked(c: Context<AppBindings>, userId: number) {
  const session = await c.env.DB.prepare(
    "SELECT unlocked_until FROM admin_sessions WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ unlocked_until: number | null }>();

  if (!session?.unlocked_until || session.unlocked_until < now()) {
    throw new HTTPException(423, { message: "Admin access is locked. Request a code." });
  }
}

/** POST /api/admin/unlock — email the admin a code. */
admin.post("/unlock", async (c) => {
  const userId = await assertAdmin(c);

  const user = await c.env.DB.prepare("SELECT email, name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string; name: string }>();
  if (!user) notFound();

  const code = generateOtp();
  const expires = now() + UNLOCK_TTL_SECONDS;

  await c.env.DB.prepare(
    `INSERT INTO admin_sessions (user_id, code_hash, expires_at, attempts)
     VALUES (?1, ?2, ?3, 0)
     ON CONFLICT (user_id) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0`,
  )
    .bind(userId, await hashOtp(code), expires)
    .run();

  const text = [
    `Your MyX admin code is ${code}`,
    "",
    `It opens the admin screens for ${SESSION_TTL_SECONDS / 60} minutes and expires in ${UNLOCK_TTL_SECONDS / 60}.`,
    "",
    "If you did not request this, someone has your password — change it.",
  ].join("\n");

  await sendEmail(c.env, {
    to: user.email,
    subject: `${code} is your MyX admin code`,
    text,
    html: `<p>Your MyX admin code is <strong style="font-size:22px;letter-spacing:6px">${code}</strong></p>
<p>It expires in ${UNLOCK_TTL_SECONDS / 60} minutes. If you did not request this, someone has your password.</p>`,
  });

  return c.json({ sent: true });
});

/** POST /api/admin/unlock/verify — redeem the code and open a window. */
admin.post("/unlock/verify", async (c) => {
  const userId = await assertAdmin(c);
  const body = await c.req.json().catch(() => null);
  const code = normalizeOtp(body?.code);

  const wrong = () => {
    throw new HTTPException(400, { message: "That code is incorrect or has expired." });
  };
  if (!isWellFormedOtp(code)) wrong();

  // Charged before the comparison, so a wrong guess always costs an attempt.
  const row = await c.env.DB.prepare(
    `UPDATE admin_sessions SET attempts = attempts + 1
      WHERE user_id = ?1 AND expires_at > ?2 AND attempts < ?3
      RETURNING code_hash`,
  )
    .bind(userId, now(), MAX_UNLOCK_ATTEMPTS)
    .first<{ code_hash: string }>();

  if (!row) wrong();
  if (row!.code_hash !== (await hashOtp(code))) wrong();

  const until = now() + SESSION_TTL_SECONDS;
  await c.env.DB.prepare(
    "UPDATE admin_sessions SET code_hash = NULL, expires_at = NULL, unlocked_until = ? WHERE user_id = ?",
  )
    .bind(until, userId)
    .run();

  return c.json({ unlocked_until: until });
});

/** GET /api/admin/session — whether the screens are currently open. */
admin.get("/session", async (c) => {
  const userId = await assertAdmin(c);
  const session = await c.env.DB.prepare(
    "SELECT unlocked_until FROM admin_sessions WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ unlocked_until: number | null }>();

  const until = session?.unlocked_until ?? null;
  return c.json({ unlocked: until !== null && until > now(), unlocked_until: until });
});

/**
 * GET /api/admin/stats — how the app is doing.
 *
 * Counts only. Nothing here reaches into what any of it says.
 */
admin.get("/stats", async (c) => {
  const userId = await assertAdmin(c);
  await assertUnlocked(c, userId);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const users = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) AS verified,
       SUM(CASE WHEN digest_enabled = 1 THEN 1 ELSE 0 END) AS digest_on,
       SUM(CASE WHEN date(created_at) >= ?1 THEN 1 ELSE 0 END) AS new_this_week
     FROM users`,
  )
    .bind(weekAgo)
    .first<{ total: number; verified: number; digest_on: number; new_this_week: number }>();

  const content = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM transactions) AS transactions,
       (SELECT COUNT(*) FROM tasks)        AS tasks,
       (SELECT COUNT(*) FROM notes)        AS notes,
       (SELECT COUNT(*) FROM checklists)   AS checklists,
       (SELECT COUNT(*) FROM memories)     AS memories,
       (SELECT COUNT(*) FROM loans)        AS loans,
       (SELECT COUNT(*) FROM goals)        AS goals,
       (SELECT COUNT(*) FROM investments)  AS investments`,
  ).first<Record<string, number>>();

  // Signups per day for the last fortnight, for a sparkline.
  const { results: signups } = await c.env.DB.prepare(
    `SELECT date(created_at) AS day, COUNT(*) AS n FROM users
      WHERE date(created_at) >= date(?1, '-14 day')
      GROUP BY day ORDER BY day`,
  )
    .bind(today)
    .all<{ day: string; n: number }>();

  const digests = await c.env.DB.prepare(
    `SELECT COUNT(*) AS sent_total,
            SUM(CASE WHEN sent_on = ?1 THEN 1 ELSE 0 END) AS sent_today
       FROM digest_log`,
  )
    .bind(today)
    .first<{ sent_total: number; sent_today: number }>();

  return c.json({
    users: users ?? {},
    content: content ?? {},
    signups: signups ?? [],
    digests: digests ?? {},
  });
});

/** GET /api/admin/errors — what has been failing. `?include=resolved` for everything. */
admin.get("/errors", async (c) => {
  const userId = await assertAdmin(c);
  await assertUnlocked(c, userId);

  const includeResolved = c.req.query("include") === "resolved";
  const { results } = await c.env.DB.prepare(
    `SELECT fingerprint, message, stack, route, method, status, count,
            first_seen, last_seen, last_user_id, resolved_at
       FROM error_log
      ${includeResolved ? "" : "WHERE resolved_at IS NULL"}
      ORDER BY last_seen DESC
      LIMIT 100`,
  ).all();

  return c.json({ errors: results ?? [] });
});

/** POST /api/admin/errors/:fingerprint/resolve — acknowledge. Recurrence reopens it. */
admin.post("/errors/:fingerprint/resolve", async (c) => {
  const userId = await assertAdmin(c);
  await assertUnlocked(c, userId);

  const fingerprint = c.req.param("fingerprint");
  await c.env.DB.prepare("UPDATE error_log SET resolved_at = ? WHERE fingerprint = ?")
    .bind(now(), fingerprint)
    .run();

  return c.json({ ok: true });
});

/** GET /api/admin/health — the operational picture the cron cannot show. */
admin.get("/health", async (c) => {
  const userId = await assertAdmin(c);
  await assertUnlocked(c, userId);

  const nowSeconds = now();
  const health = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE email_verified = 0)                        AS unverified_users,
       (SELECT COUNT(*) FROM error_log WHERE resolved_at IS NULL)                   AS open_errors,
       (SELECT COALESCE(SUM(count), 0) FROM error_log WHERE last_seen >= ?1)        AS errors_24h,
       (SELECT COUNT(*) FROM password_resets WHERE used_at IS NULL AND expires_at > ?2) AS pending_resets,
       (SELECT COUNT(*) FROM email_otps WHERE expires_at > ?2)                      AS pending_codes,
       (SELECT COUNT(*) FROM auth_attempts)                                         AS rate_limit_rows,
       (SELECT MAX(sent_on) FROM digest_log)                                        AS last_digest_on`,
  )
    .bind(nowSeconds - 86_400, nowSeconds)
    .first<Record<string, number | string | null>>();

  return c.json({ health: health ?? {}, checked_at: nowSeconds });
});

export default admin;
