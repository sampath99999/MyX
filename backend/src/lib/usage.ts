import { sendDailyDigests } from "./digest";
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
  /** 0 when D1 refuses the pragma — see collectUsage. */
  bytes: number;
  sizeAvailable: boolean;
  users: number;
  unverified: number;
  rows: number;
  overStorageWarning: boolean;
}

export async function collectUsage(db: D1Database): Promise<UsageReport> {
  /*
    page_count * page_size is what SQLite believes the file weighs, but D1
    rejects the pragma functions with SQLITE_AUTH — this threw on every run and,
    because it ran first, took the rest of the daily job down with it. Storage is
    therefore best-effort: the row counts below are the part that always works,
    and the real number is on the D1 dashboard.
  */
  let bytes = 0;
  let sizeAvailable = false;
  try {
    const size = await db
      .prepare("SELECT (SELECT * FROM pragma_page_count()) * (SELECT * FROM pragma_page_size()) AS bytes")
      .first<{ bytes: number }>();
    bytes = size?.bytes ?? 0;
    sizeAvailable = true;
  } catch {
    // Expected on D1. Not worth a log line every day.
  }

  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)                          AS users,
         (SELECT COUNT(*) FROM users WHERE email_verified = 0 AND deleted_at IS NULL)   AS unverified,
         (SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL)                      AS pending_deletion,
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

  const rows =
    (counts?.transactions ?? 0) + (counts?.tasks ?? 0) + (counts?.notes ?? 0);

  return {
    bytes,
    sizeAvailable,
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

/** Days a deleted account can still be restored by signing in. */
export const DELETION_GRACE_DAYS = 7;

/**
 * Erase accounts whose grace period has run out.
 *
 * This is the half of soft deletion that makes it a deletion rather than a
 * hidden flag: past the window the row goes, and every ON DELETE CASCADE takes
 * the transactions, tasks, notes and the rest with it — the same statement the
 * delete endpoint used to run inline, just seven days later.
 */
export async function purgeDeletedAccounts(db: D1Database): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - DELETION_GRACE_DAYS * 86_400;
  const result = await db
    .prepare("DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at < ?")
    .bind(cutoff)
    .run();
  return result.meta?.changes ?? 0;
}

/*
  Each step is isolated. The first version chained them, so the storage pragma
  failing on D1 meant no sweep, no usage line and no digests — one unsupported
  query silently disabled the entire scheduled job.
*/
export async function runDailyMaintenance(env: Env): Promise<UsageReport | null> {
  let swept = 0;
  try {
    swept = (await pruneResetTokens(env.DB)) + (await pruneVerificationCodes(env.DB));
  } catch (err) {
    console.error("[usage] sweep failed:", err);
  }

  // Its own try/catch, and announced when it does something: erasing an account
  // for good is the one thing here worth finding in the logs afterwards.
  try {
    const purged = await purgeDeletedAccounts(env.DB);
    if (purged > 0) {
      console.log(
        `[purge] ${purged} account(s) erased after the ${DELETION_GRACE_DAYS}-day restore window`,
      );
    }
  } catch (err) {
    console.error("[purge] failed:", err);
  }

  let usage: UsageReport | null = null;
  try {
    usage = await collectUsage(env.DB);
    const size = usage.sizeAvailable ? `${(usage.bytes / (1024 * 1024)).toFixed(1)} MB · ` : "";
    const line = `[usage] ${size}${usage.users} users (${usage.unverified} unverified) · ${usage.rows} content rows · ${swept} expired codes swept`;

    if (usage.overStorageWarning) {
      console.error(`${line} — STORAGE OVER 4 GB, D1 free tier stops writes at 5 GB`);
    } else {
      console.log(line);
    }
  } catch (err) {
    console.error("[usage] collection failed:", err);
  }

  /*
    Digests run on the same tick. Deliberately after the sweep and the usage
    read, and deliberately caught: a mail problem must not stop the housekeeping
    that keeps the database bounded.
  */
  try {
    const digest = await sendDailyDigests(env);
    console.log(
      `[digest] ${digest.sent} sent · ${digest.skipped} skipped (nothing due or already sent)`,
    );
    // Caps that bite are announced. A silently truncated run looks like a quiet
    // day, which is exactly the wrong impression.
    if (digest.capped) console.warn("[digest] hit the per-run send cap — some users got nothing");
    if (digest.truncated.length) {
      console.warn(`[digest] row cap hit for: ${digest.truncated.join(", ")}`);
    }
  } catch (err) {
    console.error("[digest] failed:", err);
  }

  return usage;
}
