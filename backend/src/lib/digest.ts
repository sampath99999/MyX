import { sendEmail } from "./email";
import type { Env } from "../types";

/*
  The daily digest.

  Sent only on days something is actually due. A digest that arrives every
  morning saying "nothing to report" teaches people to filter it, and it would
  spend a 100/day sending allowance on messages worth nothing.

  Everything is collected in three queries across *all* users and grouped in
  memory, rather than four queries per user. With the cron touching every
  account at once, per-user queries are what turns a free-tier D1 read budget
  into a problem.
*/

/** IST. The app deals in rupees and paise; its users' "today" is not UTC's. */
const DEFAULT_TZ_OFFSET_MINUTES = 330;

/** Bills within this many days count as upcoming. */
const BILL_LOOKAHEAD_DAYS = 2;

/** A budget this far through its limit is worth mentioning. */
const BUDGET_WARN_RATIO = 0.9;

/*
  Bounds. The row caps stop one account with thousands of overdue tasks from
  pulling the whole table into memory; the send cap keeps a burst inside the
  free tier. Both are reported when they bite — a silently truncated digest
  would look like a working one.
*/
const MAX_ROWS_PER_QUERY = 2000;
const MAX_SENDS_PER_RUN = 90;

export interface Bill {
  user_id: number;
  name: string;
  amount: number;
  next_due: string;
  type: string;
}
export interface Task {
  user_id: number;
  title: string;
  due_date: string;
  priority: number;
}
export interface Budget {
  user_id: number;
  category: string;
  amount: number;
  spent: number;
}
export interface Recipient {
  id: number;
  email: string;
  name: string;
}
export interface DigestItems {
  bills: Bill[];
  tasks: Task[];
  budgets: Budget[];
}

/** Local calendar date for an offset, as YYYY-MM-DD. */
export function localDate(now: Date, offsetMinutes: number): string {
  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Paise to ₹ with Indian digit grouping. */
export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function itemCount(items: DigestItems): number {
  return items.bills.length + items.tasks.length + items.budgets.length;
}

/**
 * Everything due, for every eligible user, in three queries.
 *
 * Eligible means opted in and verified: mailing an unverified address risks a
 * bounce against the sending domain's reputation for a message nobody asked
 * for.
 */
export async function collectDue(
  db: D1Database,
  today: string,
): Promise<{ recipients: Recipient[]; byUser: Map<number, DigestItems>; truncated: string[] }> {
  const horizon = addDays(today, BILL_LOOKAHEAD_DAYS);
  const monthPrefix = `${today.slice(0, 7)}%`;
  const truncated: string[] = [];

  const users = await db
    .prepare(
      // deleted_at IS NULL: an account waiting out its grace period is not
      // reachable in the app, and mailing it a summary of the data it just
      // asked to be rid of would be a strange way to say goodbye.
      `SELECT id, email, name FROM users
        WHERE digest_enabled = 1 AND email_verified = 1 AND deleted_at IS NULL
        ORDER BY id`,
    )
    .all<Recipient>();

  const recipients = users.results ?? [];
  const eligible = new Set(recipients.map((u) => u.id));

  // Overdue bills are included as well as upcoming ones: a payment missed
  // yesterday is more worth an email than one due tomorrow.
  const bills = await db
    .prepare(
      `SELECT user_id, name, amount, next_due, type FROM recurring
        WHERE active = 1 AND next_due <= ?1
        ORDER BY next_due, id
        LIMIT ${MAX_ROWS_PER_QUERY}`,
    )
    .bind(horizon)
    .all<Bill>();

  const tasks = await db
    .prepare(
      `SELECT user_id, title, due_date, priority FROM tasks
        WHERE status = 'open' AND due_date IS NOT NULL AND due_date <= ?1
        ORDER BY due_date, priority, id
        LIMIT ${MAX_ROWS_PER_QUERY}`,
    )
    .bind(today)
    .all<Task>();

  // Spend is correlated per budget rather than joined, so a category with no
  // transactions still reports zero instead of vanishing from the result.
  const budgets = await db
    .prepare(
      `SELECT b.user_id, b.category, b.amount,
              COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                 WHERE t.user_id = b.user_id
                   AND t.type = 'expense'
                   AND t.category = b.category
                   AND t.occurred_on LIKE ?1
              ), 0) AS spent
         FROM budgets b
        ORDER BY b.user_id, b.category
        LIMIT ${MAX_ROWS_PER_QUERY}`,
    )
    .bind(monthPrefix)
    .all<Budget>();

  if ((bills.results?.length ?? 0) >= MAX_ROWS_PER_QUERY) truncated.push("bills");
  if ((tasks.results?.length ?? 0) >= MAX_ROWS_PER_QUERY) truncated.push("tasks");
  if ((budgets.results?.length ?? 0) >= MAX_ROWS_PER_QUERY) truncated.push("budgets");

  const byUser = new Map<number, DigestItems>();
  const bucket = (id: number) => {
    let b = byUser.get(id);
    if (!b) byUser.set(id, (b = { bills: [], tasks: [], budgets: [] }));
    return b;
  };

  for (const row of bills.results ?? []) if (eligible.has(row.user_id)) bucket(row.user_id).bills.push(row);
  for (const row of tasks.results ?? []) if (eligible.has(row.user_id)) bucket(row.user_id).tasks.push(row);
  for (const row of budgets.results ?? []) {
    // Only budgets worth acting on — an untouched limit is not news.
    if (eligible.has(row.user_id) && row.spent >= row.amount * BUDGET_WARN_RATIO) {
      bucket(row.user_id).budgets.push(row);
    }
  }

  return { recipients, byUser, truncated };
}

export function renderDigest(
  name: string,
  items: DigestItems,
  today: string,
  appUrl: string,
): { subject: string; html: string; text: string } {
  const firstName = name.split(" ")[0] || "there";
  const overdueBills = items.bills.filter((b) => b.next_due < today);

  // The subject carries the most urgent thing, so the inbox list alone is
  // often enough to act on.
  const subject = overdueBills.length
    ? `${overdueBills.length} overdue · ${itemCount(items)} things need you today`
    : `${itemCount(items)} things need you today`;

  const when = (date: string) =>
    date < today ? "overdue" : date === today ? "today" : "tomorrow";

  const textLines: string[] = [`Morning ${firstName}.`, ""];
  const htmlSections: string[] = [];

  if (items.bills.length) {
    textLines.push("BILLS");
    for (const b of items.bills) {
      textLines.push(`  ${b.name} — ${rupees(b.amount)} (${when(b.next_due)})`);
    }
    textLines.push("");
    htmlSections.push(section("Bills", items.bills.map((b) =>
      `<strong>${escapeHtml(b.name)}</strong> — ${rupees(b.amount)} <span style="color:#71717a">(${when(b.next_due)})</span>`)));
  }

  if (items.tasks.length) {
    textLines.push("TASKS");
    for (const t of items.tasks) {
      textLines.push(`  ${t.title} (${when(t.due_date)})`);
    }
    textLines.push("");
    htmlSections.push(section("Tasks", items.tasks.map((t) =>
      `${escapeHtml(t.title)} <span style="color:#71717a">(${when(t.due_date)})</span>`)));
  }

  if (items.budgets.length) {
    textLines.push("BUDGETS");
    for (const b of items.budgets) {
      const pct = Math.round((b.spent / b.amount) * 100);
      textLines.push(`  ${b.category} — ${rupees(b.spent)} of ${rupees(b.amount)} (${pct}%)`);
    }
    textLines.push("");
    htmlSections.push(section("Budgets", items.budgets.map((b) => {
      const pct = Math.round((b.spent / b.amount) * 100);
      const colour = b.spent >= b.amount ? "#dc2626" : "#d97706";
      return `<strong>${escapeHtml(b.category)}</strong> — ${rupees(b.spent)} of ${rupees(b.amount)} <span style="color:${colour}">(${pct}%)</span>`;
    })));
  }

  textLines.push(`Open MyX: ${appUrl}/dashboard`, "", "Turn these off in Settings.");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
    <h1 style="margin:0 0 4px;font-size:20px">Morning ${escapeHtml(firstName)}.</h1>
    <p style="margin:0 0 24px;color:#71717a;font-size:14px">Here is what needs you today.</p>
    ${htmlSections.join("")}
    <a href="${appUrl}/dashboard" style="display:inline-block;margin-top:8px;background:#6b56ee;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Open MyX</a>
    <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px">
      You only get this on days something is due. Turn it off in Settings.
    </p>
  </div>
</body></html>`;

  return { subject, html, text: textLines.join("\n") };
}

function section(title: string, rows: string[]): string {
  return `<div style="margin-bottom:22px">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#71717a;margin-bottom:8px">${title}</div>
    ${rows.map((r) => `<div style="padding:8px 0;border-top:1px solid #ececf0;font-size:14px">${r}</div>`).join("")}
  </div>`;
}

/** User-supplied names and titles go into HTML; they have to be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send today's digests. Returns what happened, for the cron to log.
 *
 * The log row is written *before* the email, and a conflict means another run
 * already claimed this user for today — so a retried or doubled cron cannot
 * send twice. It errs toward missing a digest rather than repeating one, which
 * is the right way round for something that lands in a mailbox.
 */
export async function sendDailyDigests(
  env: Env,
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number; capped: boolean; truncated: string[] }> {
  const offset = Number(env.DIGEST_TZ_OFFSET_MINUTES ?? DEFAULT_TZ_OFFSET_MINUTES);
  const today = localDate(now, Number.isFinite(offset) ? offset : DEFAULT_TZ_OFFSET_MINUTES);
  const appUrl = (env.APP_URL ?? "https://myx.samchitech.com").replace(/\/$/, "");

  const { recipients, byUser, truncated } = await collectDue(env.DB, today);

  let sent = 0;
  let skipped = 0;
  let capped = false;

  for (const user of recipients) {
    const items = byUser.get(user.id);
    if (!items || itemCount(items) === 0) {
      skipped++;
      continue;
    }

    if (sent >= MAX_SENDS_PER_RUN) {
      capped = true;
      break;
    }

    const claim = await env.DB.prepare(
      `INSERT INTO digest_log (user_id, sent_on, items) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id, sent_on) DO NOTHING`,
    )
      .bind(user.id, today, itemCount(items))
      .run();

    if ((claim.meta?.changes ?? 0) === 0) {
      skipped++;
      continue;
    }

    const mail = renderDigest(user.name, items, today, appUrl);
    await sendEmail(env, { to: user.email, ...mail });
    sent++;
  }

  return { sent, skipped, capped, truncated };
}
