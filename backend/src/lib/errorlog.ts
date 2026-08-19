import type { Env } from "../types";

/*
  Recording exceptions so they can be looked at later.

  Before this, an unhandled error printed to the Worker log and was gone unless
  someone happened to be tailing at that moment. There was no way to answer
  "did anything break overnight", which is the whole question.

  Two decisions keep this from becoming the problem it is meant to observe:

  - Errors are grouped by fingerprint, so a request failing in a loop is one row
    with a counter rather than thousands of rows. The thousandth failure costs
    the same as the first.
  - Distinct fingerprints are capped per day. Grouping handles repetition, but
    an error whose message embeds an id or a timestamp would otherwise mint a
    new row every time and defeat it.
*/

/** New distinct error groups accepted per day, as a backstop. */
const MAX_NEW_GROUPS_PER_DAY = 1000;

/**
 * Strip the parts of a message that vary between otherwise identical failures.
 *
 * Without this "no such column: x" and "Row 47: bad date" look like different
 * problems every time they happen, and the grouping that makes this cheap stops
 * working.
 */
function normalize(message: string): string {
  return message
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, "<ts>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "<uuid>")
    .replace(/\b\d+\b/g, "<n>")
    .slice(0, 300);
}

/** Route pattern rather than the concrete path, so /loans/1 and /loans/2 group. */
function routePattern(pathname: string): string {
  return pathname
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, "/:uuid")
    .slice(0, 200);
}

async function fingerprintOf(route: string, method: string, message: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${method} ${route} ${normalize(message)}`),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export interface RecordErrorInput {
  error: unknown;
  method: string;
  pathname: string;
  status: number;
  userId?: number;
}

/**
 * Store one occurrence. Never throws — a failure to record a failure must not
 * become the response the user sees.
 */
export async function recordError(env: Env, input: RecordErrorInput): Promise<void> {
  try {
    const err = input.error;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;

    const route = routePattern(input.pathname);
    const fingerprint = await fingerprintOf(route, input.method, message);
    const now = Math.floor(Date.now() / 1000);

    /*
      Bump an existing group first. This is the common path when something is
      failing repeatedly, and it also clears resolved_at — an error that comes
      back is open again, not still acknowledged.
    */
    const bumped = await env.DB.prepare(
      `UPDATE error_log
          SET count = count + 1, last_seen = ?1, last_user_id = ?2, resolved_at = NULL
        WHERE fingerprint = ?3`,
    )
      .bind(now, input.userId ?? null, fingerprint)
      .run();

    if ((bumped.meta?.changes ?? 0) > 0) return;

    // New group — check the daily cap before adding one.
    const dayStart = now - (now % 86_400);
    const today = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM error_log WHERE first_seen >= ?",
    )
      .bind(dayStart)
      .first<{ n: number }>();

    if ((today?.n ?? 0) >= MAX_NEW_GROUPS_PER_DAY) {
      console.error(`[errorlog] daily group cap reached — not recording: ${message.slice(0, 200)}`);
      return;
    }

    await env.DB.prepare(
      `INSERT INTO error_log
         (fingerprint, message, stack, route, method, status, count, first_seen, last_seen, last_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen`,
    )
      .bind(
        fingerprint,
        message.slice(0, 500),
        stack ? stack.slice(0, 4000) : null,
        route,
        input.method,
        input.status,
        now,
        now,
        input.userId ?? null,
      )
      .run();
  } catch (recordingFailure) {
    console.error("[errorlog] could not record an error:", recordingFailure);
  }
}
