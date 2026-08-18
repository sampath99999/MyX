import type { Env } from "../types";

/*
  Daily housekeeping and quota reporting.

  MyX runs on D1's free tier: 5 GB of storage, and read/write allowances shared
  across every user. With public signups there is no longer anyone watching that
  ceiling, and the failure mode is the whole app going read-only with no warning.

  This does not attempt to poll Cloudflare's billing API — that needs an account
  token this Worker has no reason to hold. It measures what the database can
  report about itself and logs it, so the numbers show up in Workers Logs
  (observability is already enabled) and can be alerted on there.
*/

/** Warn well before the wall, so there is time to react. */
const STORAGE_WARN_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB of the 5 GB limit

export interface UsageReport {
  bytes: number;
  users: number;
  unverified: number;
  rows: number;
  overStorageWarning: boolean;
}

export async function collectUsage(db: D1Database): Promise<UsageReport> {
  // page_count * page_size is what SQLite itself believes the file weighs —
  // the only storage figure available from inside a query.
  const size = await db
    .prepare("SELECT (SELECT * FROM pragma_page_count()) * (SELECT * FROM pragma_page_size()) AS bytes")
    .first<{ bytes: number }>();

  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users)                             AS users,
         (SELECT COUNT(*) FROM users WHERE email_verified = 0)     AS unverified,
         (SELECT COUNT(*) FROM transactions) AS transactions,
         (SELECT COUNT(*) FROM tasks)        AS tasks,
         (SELECT COUNT(*) FROM notes)        AS notes`,
    )
    .first<{
      users: number;
      unverified: number;
      transactions: number;
      tasks: number;
      notes: number;
    }>();

  const bytes = size?.bytes ?? 0;
  const rows =
    (counts?.transactions ?? 0) + (counts?.tasks ?? 0) + (counts?.notes ?? 0);

  return {
    bytes,
    users: counts?.users ?? 0,
    unverified: counts?.unverified ?? 0,
    rows,
    overStorageWarning: bytes >= STORAGE_WARN_BYTES,
  };
}

/** Expired and spent reset tokens are dead weight; sweep them on the same tick. */
export async function pruneResetTokens(db: D1Database): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare("DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL")
    .bind(now)
    .run();
  return result.meta?.changes ?? 0;
}

/** Expired verification codes are as dead as spent reset tokens. */
export async function pruneVerificationCodes(db: D1Database): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare("DELETE FROM email_otps WHERE expires_at < ?")
    .bind(now)
    .run();
  return result.meta?.changes ?? 0;
}

export async function runDailyMaintenance(env: Env): Promise<UsageReport> {
  const swept = (await pruneResetTokens(env.DB)) + (await pruneVerificationCodes(env.DB));
  const usage = await collectUsage(env.DB);

  const mb = (usage.bytes / (1024 * 1024)).toFixed(1);
  const line = `[usage] ${mb} MB · ${usage.users} users (${usage.unverified} unverified) · ${usage.rows} content rows · ${swept} expired codes swept`;

  if (usage.overStorageWarning) {
    console.error(`${line} — STORAGE OVER 4 GB, D1 free tier stops writes at 5 GB`);
  } else {
    console.log(line);
  }

  return usage;
}
