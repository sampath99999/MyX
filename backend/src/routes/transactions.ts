import { Hono, type Context } from "hono";
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

/**
 * The ways the ledger can be sorted, and the SQL each one means.
 *
 * An allowlist rather than an interpolated column name: this ends up inside an
 * ORDER BY, which cannot be parameterised, so the value must never come from
 * the request except as a key into this object.
 *
 * Every clause ends in `id` — without a tiebreak, two rows on the same date
 * come back in whatever order SQLite feels like, and a stable order is what
 * makes LIMIT/OFFSET paging trustworthy.
 */
const SORTS = {
  date_desc: "occurred_on DESC, id DESC",
  date_asc: "occurred_on ASC, id ASC",
  amount_desc: "amount DESC, id DESC",
  amount_asc: "amount ASC, id ASC",
} as const;

type Sort = keyof typeof SORTS;

/** Escapes LIKE's own wildcards so a literal % is not a match-everything. */
const likeTerm = (raw: string) => `%${raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

/**
 * Builds the WHERE clause shared by the list and its totals.
 *
 * Both have to agree exactly. When the filters lived only in the list query the
 * summary strip above it described the whole account instead of the rows on
 * screen, which is a quietly wrong number — the worst kind on a money screen.
 */
function buildFilters(c: Context<AppBindings>, userId: number) {
  const clauses = ["user_id = ?"];
  const binds: unknown[] = [userId];

  const type = c.req.query("type");
  if (type === "income" || type === "expense") {
    clauses.push("type = ?");
    binds.push(type);
  }

  const from = c.req.query("from");
  if (from && dateRe.test(from)) {
    clauses.push("occurred_on >= ?");
    binds.push(from);
  }

  const to = c.req.query("to");
  if (to && dateRe.test(to)) {
    clauses.push("occurred_on <= ?");
    binds.push(to);
  }

  const category = c.req.query("category");
  if (category) {
    clauses.push("category = ?");
    binds.push(category);
  }

  const q = (c.req.query("q") ?? "").trim();
  if (q) {
    clauses.push("(note LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')");
    binds.push(likeTerm(q), likeTerm(q));
  }

  // Sent in rupees, like every other amount on the wire; compared in paise,
  // which is what the column holds.
  const min = Number(c.req.query("min"));
  if (Number.isFinite(min) && c.req.query("min") !== undefined && c.req.query("min") !== "") {
    clauses.push("amount >= ?");
    binds.push(toPaise(min));
  }

  const max = Number(c.req.query("max"));
  if (Number.isFinite(max) && c.req.query("max") !== undefined && c.req.query("max") !== "") {
    clauses.push("amount <= ?");
    binds.push(toPaise(max));
  }

  return { where: clauses.join(" AND "), binds };
}

/**
 * GET /api/transactions — the ledger, filtered.
 *
 * Query: limit, offset, type, from, to, category, q, min, max, sort.
 *
 * Filtering is here rather than in the browser because the page only ever holds
 * a page of rows. "Show me last March" applied to the most recent hundred
 * silently answers a different question, and looks like missing data.
 */
tx.get("/", async (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const sortKey = c.req.query("sort") as Sort | undefined;
  const order = SORTS[sortKey ?? "date_desc"] ?? SORTS.date_desc;

  const { where, binds } = buildFilters(c, user.sub);

  const [list, totals] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, type, amount, category, note, occurred_on, created_at
         FROM transactions WHERE ${where}
        ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).bind(...binds, limit, offset),

    // Totals for the whole filtered set, not just this page — otherwise the
    // strip above the list changes every time you scroll.
    c.env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='income'  THEN amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) AS expense,
         COUNT(*) AS matched
       FROM transactions WHERE ${where}`,
    ).bind(...binds),
  ]);

  const rows = (list.results ?? []) as unknown as TxRow[];
  const sums = ((totals.results ?? [])[0] ?? {}) as unknown as {
    income: number;
    expense: number;
    matched: number;
  };

  return c.json({
    transactions: rows.map(serialize),
    totals: {
      income: toRupees(sums.income ?? 0),
      expense: toRupees(sums.expense ?? 0),
      net: toRupees((sums.income ?? 0) - (sums.expense ?? 0)),
      matched: sums.matched ?? 0,
    },
  });
});

/**
 * GET /api/transactions/categories — the categories actually in use.
 *
 * The category picker offers a fixed list; this is what the account has really
 * spent under, which is what a filter should offer. Nobody wants to filter by a
 * category with nothing in it.
 */
tx.get("/categories", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n FROM transactions
      WHERE user_id = ? GROUP BY category ORDER BY n DESC, category`,
  )
    .bind(user.sub)
    .all<{ category: string; n: number }>();

  return c.json({ categories: results ?? [] });
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

/**
 * GET /api/transactions/:id — one transaction.
 *
 * Registered after /summary so that word is never read as an id, and needed
 * because /money/transactions/:id is a real, linkable address now: a search
 * result or a bookmark can point at a single row, and the list only holds the
 * most recent hundred.
 */
tx.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const row = await c.env.DB.prepare(
    "SELECT id, type, amount, category, note, occurred_on, created_at FROM transactions WHERE id = ? AND user_id = ?",
  )
    .bind(id, user.sub)
    .first<TxRow>();
  if (!row) throw new HTTPException(404, { message: "Transaction not found" });

  return c.json({ transaction: serialize(row) });
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

/** Bounded so one request cannot hold the Worker for the length of a whole statement. */
const MAX_IMPORT_ROWS = 500;

/**
 * POST /api/transactions/import — write many rows at once.
 *
 * Manual entry is what kills a money app: the charts, budgets and digest are
 * all starved until a year of history is in, and nobody types a year of
 * history. This is the endpoint behind importing a bank statement.
 *
 * Parsing and column-mapping happen in the browser — the file never leaves the
 * user's machine, which matters when the file is a bank statement, and the
 * server sees only the rows it is being asked to store.
 *
 * The batch is all-or-nothing: a half-imported statement is worse than a failed
 * one, because it is invisible until the totals look wrong.
 */
tx.post("/import", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const rows = body?.transactions;

  if (!Array.isArray(rows) || rows.length === 0)
    throw new HTTPException(400, { message: "transactions must be a non-empty array" });
  if (rows.length > MAX_IMPORT_ROWS)
    throw new HTTPException(400, {
      message: `Too many rows at once — split the file into batches of ${MAX_IMPORT_ROWS}`,
    });

  // Validated up front, so nothing is written if any row is bad. The index is
  // reported because "row 3 has no category" is actionable and "invalid" is not.
  const prepared = rows.map((row: Record<string, unknown>, i: number) => {
    const fail = (message: string): never => {
      throw new HTTPException(400, { message: `Row ${i + 1}: ${message}` });
    };

    const type = row?.type;
    if (type !== "income" && type !== "expense") fail("type must be 'income' or 'expense'");

    const amount = Number(row?.amount);
    if (!Number.isFinite(amount) || amount <= 0) fail("amount must be a positive number");

    const category = String(row?.category ?? "").trim();
    if (!category) fail("category is required");

    const occurred_on = String(row?.occurred_on ?? "");
    if (!dateRe.test(occurred_on)) fail("occurred_on must be YYYY-MM-DD");

    const note = row?.note ? String(row.note).trim().slice(0, 500) : null;
    return { type, amount: toPaise(amount), category: category.slice(0, 60), note, occurred_on };
  });

  await c.env.DB.batch(
    prepared.map((r) =>
      c.env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, category, note, occurred_on)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(user.sub, r.type, r.amount, r.category, r.note, r.occurred_on),
    ),
  );

  return c.json({ imported: prepared.length }, 201);
});

export default tx;
