import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import { detectRecurring, signatureOf, LOOKBACK_DAYS, type TxnLike } from "../lib/detect";
import type { AppBindings } from "../types";

const recurring = new Hono<AppBindings>();
recurring.use("*", requireAuth);

type Frequency = "daily" | "weekly" | "monthly" | "yearly";

interface RecurringRow {
  id: number;
  name: string;
  type: "income" | "expense";
  amount: number; // paise
  category: string;
  frequency: Frequency;
  interval: number;
  next_due: string;
  note: string | null;
  active: number;
  last_paid_on: string | null;
  created_at: string;
}

const toPaise = (r: number) => Math.round(r * 100);
const toRupees = (p: number) => p / 100;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Advance a YYYY-MM-DD date by interval periods of the given frequency. */
export function advanceDate(iso: string, frequency: Frequency, interval: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (frequency === "daily") {
    date.setUTCDate(date.getUTCDate() + interval);
  } else if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7 * interval);
  } else if (frequency === "monthly") {
    const targetMonthIndex = date.getUTCMonth() + interval;
    const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const normMonth = ((targetMonthIndex % 12) + 12) % 12;
    const day = Math.min(d, daysInMonth(targetYear, normMonth));
    date.setUTCFullYear(targetYear, normMonth, day);
  } else {
    // yearly
    date.setUTCFullYear(date.getUTCFullYear() + interval);
  }
  return date.toISOString().slice(0, 10);
}

function serialize(r: RecurringRow) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    amount: toRupees(r.amount),
    category: r.category,
    frequency: r.frequency,
    interval: r.interval,
    next_due: r.next_due,
    note: r.note,
    active: r.active === 1,
    last_paid_on: r.last_paid_on,
    created_at: r.created_at,
  };
}

/** GET /api/recurring — active first, then by next due date. */
recurring.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM recurring WHERE user_id = ? ORDER BY active DESC, next_due ASC",
  )
    .bind(user.sub)
    .all<RecurringRow>();
  return c.json({ recurring: (results ?? []).map(serialize) });
});

/** GET /api/recurring/summary — monthly committed income/expense (normalized to a month). */
recurring.get("/summary", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT type, amount, frequency, interval FROM recurring WHERE user_id = ? AND active = 1",
  )
    .bind(user.sub)
    .all<Pick<RecurringRow, "type" | "amount" | "frequency" | "interval">>();

  // Normalize each item to an approximate monthly amount.
  const perMonth = (amount: number, frequency: Frequency, interval: number) => {
    const factor =
      frequency === "daily"
        ? 30 / interval
        : frequency === "weekly"
          ? 52 / 12 / interval
          : frequency === "monthly"
            ? 1 / interval
            : 1 / 12 / interval; // yearly
    return amount * factor;
  };

  let income = 0;
  let expense = 0;
  for (const r of results ?? []) {
    const monthly = perMonth(r.amount, r.frequency, r.interval);
    if (r.type === "income") income += monthly;
    else expense += monthly;
  }
  return c.json({
    monthlyIncome: toRupees(Math.round(income)),
    monthlyExpense: toRupees(Math.round(expense)),
    count: (results ?? []).length,
  });
});

/*
  ----- Detection -----
  Registered before the /:id routes so "suggestions" is never read as an id.
*/

/**
 * GET /api/recurring/suggestions — bills the transactions already imply.
 *
 * Two things are filtered out before anything is proposed: signatures the user
 * has already dismissed, and anything that looks like a rule they have already
 * created. Suggesting a bill someone set up last week makes the whole feature
 * feel like it is not paying attention.
 */
recurring.get("/suggestions", async (c) => {
  const user = c.get("user");
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [txns, existing, ignored] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT type, amount, category, note, occurred_on FROM transactions
        WHERE user_id = ?1 AND occurred_on >= ?2
        ORDER BY occurred_on LIMIT 5000`,
    ).bind(user.sub, since),
    c.env.DB.prepare("SELECT name, category FROM recurring WHERE user_id = ?").bind(user.sub),
    c.env.DB.prepare("SELECT signature FROM recurring_ignored WHERE user_id = ?").bind(user.sub),
  ]);

  const dismissed = new Set(
    ((ignored.results ?? []) as { signature: string }[]).map((r) => r.signature),
  );
  // Compared on the same normalised form the suggestions carry, so "NETFLIX" as
  // a rule matches "netflix" out of a statement narration.
  const alreadyHave = new Set(
    ((existing.results ?? []) as { name: string; category: string }[]).map((r) =>
      signatureOf(r.name, r.category),
    ),
  );

  const suggestions = detectRecurring(
    (txns.results ?? []) as TxnLike[],
    today,
  ).filter((s) => !dismissed.has(s.signature) && !alreadyHave.has(s.signature));

  return c.json({
    suggestions: suggestions.slice(0, 8).map((s) => ({ ...s, amount: toRupees(s.amount) })),
  });
});

/** POST /api/recurring/suggestions/dismiss — stop proposing this one. */
recurring.post("/suggestions/dismiss", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const signature = String(body?.signature ?? "").trim();
  if (!signature) throw new HTTPException(400, { message: "signature is required" });

  await c.env.DB.prepare(
    `INSERT INTO recurring_ignored (user_id, signature) VALUES (?, ?)
     ON CONFLICT (user_id, signature) DO NOTHING`,
  )
    .bind(user.sub, signature)
    .run();

  return c.json({ ok: true });
});

/** POST /api/recurring — create. */
recurring.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const name = String(body?.name ?? "").trim();
  const type = body?.type;
  const amount = Number(body?.amount);
  const category = String(body?.category ?? "").trim();
  const frequency = body?.frequency;
  const interval = body?.interval != null ? Number(body.interval) : 1;
  const next_due = String(body?.next_due ?? "");
  const note = body?.note ? String(body.note).trim() : null;

  if (!name) throw new HTTPException(400, { message: "Name is required" });
  if (type !== "income" && type !== "expense")
    throw new HTTPException(400, { message: "type must be 'income' or 'expense'" });
  if (!Number.isFinite(amount) || amount <= 0)
    throw new HTTPException(400, { message: "amount must be a positive number" });
  if (!category) throw new HTTPException(400, { message: "category is required" });
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency))
    throw new HTTPException(400, { message: "invalid frequency" });
  if (!Number.isInteger(interval) || interval < 1)
    throw new HTTPException(400, { message: "interval must be a positive integer" });
  if (!dateRe.test(next_due))
    throw new HTTPException(400, { message: "next_due must be YYYY-MM-DD" });

  const created = await c.env.DB.prepare(
    `INSERT INTO recurring (user_id, name, type, amount, category, frequency, interval, next_due, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(user.sub, name, type, toPaise(amount), category, frequency, interval, next_due, note)
    .first<RecurringRow>();

  if (!created) throw new HTTPException(500, { message: "Failed to create recurring item" });
  return c.json({ recurring: serialize(created) }, 201);
});

/** POST /api/recurring/:id/pay — record a transaction and advance next_due. */
recurring.post("/:id/pay", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const r = await c.env.DB.prepare("SELECT * FROM recurring WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<RecurringRow>();
  if (!r) throw new HTTPException(404, { message: "Recurring item not found" });
  if (r.active !== 1)
    throw new HTTPException(400, { message: "This bill is paused — resume it before marking it paid." });

  // Optimistic concurrency instead of an idempotency column: the client tells us
  // which due date it believes it is paying. Because a successful payment rolls
  // next_due forward, a double-tap arrives with a stale date and is rejected
  // rather than booking the same bill twice.
  const expected = body?.expected_next_due ? String(body.expected_next_due) : null;
  if (expected && expected !== r.next_due)
    throw new HTTPException(409, {
      message: "This bill was already marked paid.",
    });

  const occurredOn = r.next_due;
  const nextDue = advanceDate(r.next_due, r.frequency, r.interval);
  const today = new Date().toISOString().slice(0, 10);

  const batch = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO transactions (user_id, type, amount, category, note, occurred_on)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(user.sub, r.type, r.amount, r.category, r.note ?? r.name, occurredOn),
    c.env.DB.prepare("UPDATE recurring SET next_due = ?, last_paid_on = ? WHERE id = ? AND user_id = ?").bind(
      nextDue,
      today,
      id,
      user.sub,
    ),
  ]);
  if (!batch[0].success || !batch[1].success)
    throw new HTTPException(500, { message: "Failed to record payment" });

  const updated = await c.env.DB.prepare("SELECT * FROM recurring WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<RecurringRow>();
  return c.json({ recurring: serialize(updated!), paid: { amount: toRupees(r.amount), occurred_on: occurredOn } });
});

/** PATCH /api/recurring/:id — edit fields (including active toggle). */
recurring.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const r = await c.env.DB.prepare("SELECT * FROM recurring WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<RecurringRow>();
  if (!r) throw new HTTPException(404, { message: "Recurring item not found" });

  const name = body?.name != null ? String(body.name).trim() : r.name;
  const type = body?.type ?? r.type;
  const amount = body?.amount != null ? toPaise(Number(body.amount)) : r.amount;
  const category = body?.category != null ? String(body.category).trim() : r.category;
  const frequency = body?.frequency ?? r.frequency;
  const interval = body?.interval != null ? Number(body.interval) : r.interval;
  const next_due = body?.next_due != null ? String(body.next_due) : r.next_due;
  const note = body?.note !== undefined ? (body.note ? String(body.note).trim() : null) : r.note;
  const active = body?.active != null ? (body.active ? 1 : 0) : r.active;

  if (!name) throw new HTTPException(400, { message: "Name is required" });
  if (type !== "income" && type !== "expense")
    throw new HTTPException(400, { message: "invalid type" });
  if (!Number.isFinite(amount) || amount <= 0)
    throw new HTTPException(400, { message: "invalid amount" });
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency))
    throw new HTTPException(400, { message: "invalid frequency" });
  if (!Number.isInteger(interval) || interval < 1)
    throw new HTTPException(400, { message: "invalid interval" });
  if (!dateRe.test(next_due))
    throw new HTTPException(400, { message: "next_due must be YYYY-MM-DD" });

  const updated = await c.env.DB.prepare(
    `UPDATE recurring SET name=?, type=?, amount=?, category=?, frequency=?, interval=?, next_due=?, note=?, active=?
     WHERE id=? AND user_id=? RETURNING *`,
  )
    .bind(name, type, amount, category, frequency, interval, next_due, note, active, id, user.sub)
    .first<RecurringRow>();
  return c.json({ recurring: serialize(updated!) });
});

/** DELETE /api/recurring/:id */
recurring.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM recurring WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Recurring item not found" });
  return c.json({ ok: true });
});

export default recurring;
