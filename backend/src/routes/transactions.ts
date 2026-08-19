import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const tx = new Hono<AppBindings>();
tx.use("*", requireAuth); // every money route requires auth

interface TxRow {
  id: number;
  type: "income" | "expense";
  amount: number; // paise
  category: string;
  note: string | null;
  occurred_on: string;
  created_at: string;
}

// API exposes rupees (decimal); DB stores paise (integer).
const toPaise = (rupees: number) => Math.round(rupees * 100);
const toRupees = (paise: number) => paise / 100;

function serialize(row: TxRow) {
  return {
    id: row.id,
    type: row.type,
    amount: toRupees(row.amount),
    category: row.category,
    note: row.note,
    occurred_on: row.occurred_on,
    created_at: row.created_at,
  };
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/transactions?limit=&offset=&type= — list, newest first. */
tx.get("/", async (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const type = c.req.query("type");

  let sql =
    "SELECT id, type, amount, category, note, occurred_on, created_at FROM transactions WHERE user_id = ?";
  const binds: unknown[] = [user.sub];
  if (type === "income" || type === "expense") {
    sql += " AND type = ?";
    binds.push(type);
  }
  sql += " ORDER BY occurred_on DESC, id DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<TxRow>();
  return c.json({ transactions: (results ?? []).map(serialize) });
});

/** GET /api/transactions/summary — balance + totals (all-time and this month). */
tx.get("/summary", async (c) => {
  const user = c.get("user");
  const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM

  const row = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type='income'  THEN amount END), 0) AS income,
       COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) AS expense,
       COALESCE(SUM(CASE WHEN type='income'  AND occurred_on LIKE ?1 THEN amount END), 0) AS month_income,
       COALESCE(SUM(CASE WHEN type='expense' AND occurred_on LIKE ?1 THEN amount END), 0) AS month_expense,
       COUNT(*) AS count
     FROM transactions WHERE user_id = ?2`,
  )
    .bind(`${monthPrefix}%`, user.sub)
    .first<{
      income: number;
      expense: number;
      month_income: number;
      month_expense: number;
      count: number;
    }>();

  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  return c.json({
    balance: toRupees(income - expense),
    totalIncome: toRupees(income),
    totalExpense: toRupees(expense),
    monthIncome: toRupees(row?.month_income ?? 0),
    monthExpense: toRupees(row?.month_expense ?? 0),
    count: row?.count ?? 0,
  });
});

/** POST /api/transactions — create. Body: { type, amount, category, note?, occurred_on? } */
tx.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const type = body?.type;
  const amount = Number(body?.amount);
  const category = String(body?.category ?? "").trim();
  const note = body?.note ? String(body.note).trim() : null;
  const occurred_on = body?.occurred_on
    ? String(body.occurred_on)
    : new Date().toISOString().slice(0, 10);

  if (type !== "income" && type !== "expense")
    throw new HTTPException(400, { message: "type must be 'income' or 'expense'" });
  if (!Number.isFinite(amount) || amount <= 0)
    throw new HTTPException(400, { message: "amount must be a positive number" });
  if (!category) throw new HTTPException(400, { message: "category is required" });
  if (!dateRe.test(occurred_on))
    throw new HTTPException(400, { message: "occurred_on must be YYYY-MM-DD" });

  const created = await c.env.DB.prepare(
    `INSERT INTO transactions (user_id, type, amount, category, note, occurred_on)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id, type, amount, category, note, occurred_on, created_at`,
  )
    .bind(user.sub, type, toPaise(amount), category, note, occurred_on)
    .first<TxRow>();

  if (!created) throw new HTTPException(500, { message: "Failed to create transaction" });
  return c.json({ transaction: serialize(created) }, 201);
});

/**
 * PATCH /api/transactions/:id — correct an entry.
 *
 * Until this existed the only way to fix a mistyped amount was to delete the
 * row and retype it, which loses the original created_at and is a miserable
 * answer to the most common correction in a money app.
 *
 * Every field is optional; anything omitted is left alone. Validation matches
 * POST exactly, so a correction cannot put the row into a state the create
 * endpoint would have refused.
 */
tx.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object")
    throw new HTTPException(400, { message: "Nothing to update" });

  const existing = await c.env.DB.prepare(
    "SELECT id, type, amount, category, note, occurred_on FROM transactions WHERE id = ? AND user_id = ?",
  )
    .bind(id, user.sub)
    .first<TxRow>();
  if (!existing) throw new HTTPException(404, { message: "Transaction not found" });

  let { type, category, note, occurred_on } = existing;
  let amountPaise = existing.amount;

  if (body.type !== undefined) {
    if (body.type !== "income" && body.type !== "expense")
      throw new HTTPException(400, { message: "type must be 'income' or 'expense'" });
    type = body.type;
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new HTTPException(400, { message: "amount must be a positive number" });
    amountPaise = toPaise(amount);
  }
  if (body.category !== undefined) {
    const next = String(body.category).trim();
    if (!next) throw new HTTPException(400, { message: "category is required" });
    category = next;
  }
  // Explicitly nullable: clearing a note is a legitimate edit.
  if (body.note !== undefined) {
    const next = body.note === null ? null : String(body.note).trim();
    note = next || null;
  }
  if (body.occurred_on !== undefined) {
    const next = String(body.occurred_on);
    if (!dateRe.test(next))
      throw new HTTPException(400, { message: "occurred_on must be YYYY-MM-DD" });
    occurred_on = next;
  }

  const updated = await c.env.DB.prepare(
    `UPDATE transactions SET type = ?, amount = ?, category = ?, note = ?, occurred_on = ?
      WHERE id = ? AND user_id = ?
      RETURNING id, type, amount, category, note, occurred_on, created_at`,
  )
    .bind(type, amountPaise, category, note, occurred_on, id, user.sub)
    .first<TxRow>();

  if (!updated) throw new HTTPException(500, { message: "Failed to update transaction" });
  return c.json({ transaction: serialize(updated) });
});

/** DELETE /api/transactions/:id */
tx.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();

  if (!res.meta.changes) throw new HTTPException(404, { message: "Transaction not found" });
  return c.json({ ok: true });
});

export default tx;
