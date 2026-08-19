import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const budgets = new Hono<AppBindings>();
budgets.use("*", requireAuth);

interface BudgetJoinRow {
  id: number;
  category: string;
  amount: number; // paise limit
  spent: number; // paise, current month
}

const toPaise = (r: number) => Math.round(r * 100);
const toRupees = (p: number) => p / 100;

function serialize(b: BudgetJoinRow) {
  const limit = toRupees(b.amount);
  const spent = toRupees(b.spent);
  return {
    id: b.id,
    category: b.category,
    limit,
    spent,
    remaining: limit - spent, // can be negative when over budget
    percent: b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0,
    over: b.spent > b.amount,
  };
}

/**
 * GET /api/budgets — budgets with a month's spend joined in.
 *
 * `?month=YYYY-MM` looks at any month, defaulting to the current one. Budgets
 * were current-month only, so there was no way to see whether last month went
 * well — which is the only way to know a limit is working. Spend is derived
 * from transactions, so history needs no table of its own; the one thing it
 * cannot reconstruct is a limit that has since been changed.
 */
budgets.get("/", async (c) => {
  const user = c.get("user");

  const requestedMonth = c.req.query("month");
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (requestedMonth !== undefined && !/^\d{4}-\d{2}$/.test(requestedMonth))
    throw new HTTPException(400, { message: "month must be in YYYY-MM form" });
  if (requestedMonth !== undefined && requestedMonth > currentMonth)
    throw new HTTPException(400, { message: "month cannot be in the future" });

  const month = requestedMonth ?? currentMonth;
  const monthLike = `${month}%`;

  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.category, b.amount,
            COALESCE((
              SELECT SUM(t.amount) FROM transactions t
              WHERE t.user_id = b.user_id
                AND t.type = 'expense'
                AND t.category = b.category
                AND t.occurred_on LIKE ?1
            ), 0) AS spent
     FROM budgets b
     WHERE b.user_id = ?2
     ORDER BY b.category`,
  )
    .bind(monthLike, user.sub)
    .all<BudgetJoinRow>();

  const items = (results ?? []).map(serialize);
  const totalLimit = items.reduce((s, b) => s + b.limit, 0);
  const totalSpent = items.reduce((s, b) => s + b.spent, 0);

  return c.json({
    month,
    budgets: items,
    totals: {
      limit: totalLimit,
      spent: totalSpent,
      remaining: totalLimit - totalSpent,
    },
  });
});

/** POST /api/budgets — create. Body: { category, amount } */
budgets.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const category = String(body?.category ?? "").trim();
  const amount = Number(body?.amount);

  if (!category) throw new HTTPException(400, { message: "Category is required" });
  if (!Number.isFinite(amount) || amount <= 0)
    throw new HTTPException(400, { message: "Amount must be a positive number" });

  const existing = await c.env.DB.prepare(
    "SELECT id FROM budgets WHERE user_id = ? AND category = ?",
  )
    .bind(user.sub, category)
    .first();
  if (existing)
    throw new HTTPException(409, { message: `A budget for "${category}" already exists` });

  const created = await c.env.DB.prepare(
    "INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?) RETURNING id, category, amount",
  )
    .bind(user.sub, category, toPaise(amount))
    .first<{ id: number; category: string; amount: number }>();
  if (!created) throw new HTTPException(500, { message: "Failed to create budget" });

  return c.json({ budget: serialize({ ...created, spent: 0 }) }, 201);
});

/** PATCH /api/budgets/:id — update the monthly limit. Body: { amount } */
budgets.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const amount = Number(body?.amount);

  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  if (!Number.isFinite(amount) || amount <= 0)
    throw new HTTPException(400, { message: "Amount must be a positive number" });

  const res = await c.env.DB.prepare(
    "UPDATE budgets SET amount = ? WHERE id = ? AND user_id = ?",
  )
    .bind(toPaise(amount), id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Budget not found" });
  return c.json({ ok: true });
});

/** DELETE /api/budgets/:id */
budgets.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM budgets WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Budget not found" });
  return c.json({ ok: true });
});

export default budgets;
