// Fixed-window rate limiting backed by D1.
//
// Why D1 and not the Cloudflare rate-limiting binding: the binding only supports
// 10s and 60s periods, which is far too short for credential stuffing (5/60s is
// still 300 guesses an hour). This gives us real windows, per-account lockout,
// and it is testable without a Worker runtime.
//
// Cost note: one indexed upsert per attempt. That is orders of magnitude cheaper
// than the 100k-iteration PBKDF2 it protects, which is the whole point — the
// limiter must run BEFORE any password hashing.

export interface RateLimitRule {
  /** Attempts allowed inside one window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts remaining in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the current window rolls over. */
  retryAfter: number;
}

/** Per-IP is the flood gate; per-email stops a slow spray across many IPs. */
export const LOGIN_IP_RULE: RateLimitRule = { limit: 20, windowSeconds: 900 }; // 20 / 15 min
export const LOGIN_EMAIL_RULE: RateLimitRule = { limit: 5, windowSeconds: 900 }; //  5 / 15 min
export const REGISTER_IP_RULE: RateLimitRule = { limit: 5, windowSeconds: 3600 }; //  5 / hour

/**
 * Count this attempt against `key` and report whether it is allowed.
 *
 * Uses an atomic `ON CONFLICT ... DO UPDATE ... RETURNING` so two concurrent
 * requests cannot both read the same count and both decide they are under the
 * limit — the returned value is always the post-increment count.
 */
export async function consumeAttempt(
  db: D1Database,
  key: string,
  rule: RateLimitRule,
  now: number = Math.floor(Date.now() / 1000),
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;
  const retryAfter = windowStart + rule.windowSeconds - now;

  const row = await db
    .prepare(
      `INSERT INTO auth_attempts (bucket_key, window_start, attempts)
       VALUES (?, ?, 1)
       ON CONFLICT (bucket_key, window_start)
       DO UPDATE SET attempts = attempts + 1
       RETURNING attempts`,
    )
    .bind(key, windowStart)
    .first<{ attempts: number }>();

  const attempts = row?.attempts ?? 1;
  return {
    allowed: attempts <= rule.limit,
    remaining: Math.max(rule.limit - attempts, 0),
    retryAfter,
  };
}

/**
 * Read the current count for a key WITHOUT incrementing it.
 *
 * Used for buckets that should only count failures (the per-email login bucket):
 * we check before doing the work, and record only if the attempt turns out to be
 * wrong. Sums across windows still inside the rule's period so a burst spanning
 * a window boundary cannot slip through at double the limit.
 */
export async function peekAttempts(
  db: D1Database,
  key: string,
  rule: RateLimitRule,
  now: number = Math.floor(Date.now() / 1000),
): Promise<number> {
  // Sum the current window plus the one before it.
  //
  // Comparing against `now - windowSeconds` would be wrong: it drops a window
  // whose *start* is older than the lookback even when the attempts inside it
  // happened seconds ago, letting an attacker reset their budget by straddling
  // a boundary. Anchoring on the window grid instead guarantees at least a full
  // period of history is always counted.
  const currentWindow = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(attempts), 0) AS n FROM auth_attempts
       WHERE bucket_key = ? AND window_start >= ?`,
    )
    .bind(key, currentWindow - rule.windowSeconds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Clear the counters for a key — called after a successful login so that a user
 * who simply mistyped their password a few times is not left rate limited.
 */
export async function resetAttempts(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM auth_attempts WHERE bucket_key = ?").bind(key).run();
}

/**
 * Drop windows that can no longer affect a decision. Called opportunistically so
 * the table cannot grow without bound under a sustained attack.
 */
export async function pruneExpired(
  db: D1Database,
  now: number = Math.floor(Date.now() / 1000),
  maxWindowSeconds = 3600,
): Promise<void> {
  await db
    .prepare("DELETE FROM auth_attempts WHERE window_start < ?")
    .bind(now - maxWindowSeconds * 2)
    .run();
}

/**
 * Best-effort client IP. Cloudflare sets CF-Connecting-IP and strips any
 * client-supplied copy, so it cannot be spoofed on a real deployment; the
 * fallbacks only matter for local dev.
 */
export function clientIp(headers: { get: (name: string) => string | null }): string {
  return (
    headers.get("CF-Connecting-IP") ??
    headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
