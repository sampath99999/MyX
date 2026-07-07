import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const investments = new Hono<AppBindings>();
investments.use("*", requireAuth);

export const INVESTMENT_TYPES = [
  "stocks",
  "mutual_fund",
  "fd",
  "ppf_epf",
  "gold",
  "crypto",
  "other",
] as const;
type InvestmentType = (typeof INVESTMENT_TYPES)[number];

interface InvestmentRow {
  id: number;
  name: string;
  type: InvestmentType;
  invested_amount: number; // paise
  current_value: number; // paise
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const toPaise = (r: number) => Math.round(r * 100);
const toRupees = (p: number) => p / 100;

function serialize(i: InvestmentRow) {
  const invested = toRupees(i.invested_amount);
  const current = toRupees(i.current_value);
  const gain = current - invested;
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    invested,
    current,
    gain,
    gainPercent: invested > 0 ? Math.round((gain / invested) * 1000) / 10 : 0,
    notes: i.notes,
    created_at: i.created_at,
    updated_at: i.updated_at,
  };
}

/** GET /api/investments — list, newest first, plus portfolio totals. */
investments.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(user.sub)
    .all<InvestmentRow>();

  const items = (results ?? []).map(serialize);
  const totals = items.reduce(
    (acc, i) => ({
      invested: acc.invested + i.invested,
      current: acc.current + i.current,
      count: acc.count + 1,
    }),
    { invested: 0, current: 0, count: 0 },
  );

  return c.json({
    investments: items,
    totals: {
      ...totals,
      gain: totals.current - totals.invested,
      gainPercent:
        totals.invested > 0
          ? Math.round(((totals.current - totals.invested) / totals.invested) * 1000) / 10
          : 0,
    },
  });
});

/** POST /api/investments — create. Body: { name, type, invested, current?, notes? } */
investments.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const name = String(body?.name ?? "").trim();
  const type = String(body?.type ?? "");
  const invested = Number(body?.invested);
  const current = body?.current != null ? Number(body.current) : invested;
  const notes = body?.notes ? String(body.notes).trim().slice(0, 2000) : null;

  if (!name) throw new HTTPException(400, { message: "Name is required" });
  if (!INVESTMENT_TYPES.includes(type as InvestmentType))
    throw new HTTPException(400, { message: "Invalid investment type" });
  if (!Number.isFinite(invested) || invested < 0)
    throw new HTTPException(400, { message: "Invested amount must be a non-negative number" });
  if (!Number.isFinite(current) || current < 0)
    throw new HTTPException(400, { message: "Current value must be a non-negative number" });

  const created = await c.env.DB.prepare(
    `INSERT INTO investments (user_id, name, type, invested_amount, current_value, notes)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(user.sub, name, type, toPaise(invested), toPaise(current), notes)
    .first<InvestmentRow>();

  if (!created) throw new HTTPException(500, { message: "Failed to create investment" });
  return c.json({ investment: serialize(created) }, 201);
});

/** PATCH /api/investments/:id — edit name / type / invested / current / notes. */
investments.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const existing = await c.env.DB.prepare(
    "SELECT * FROM investments WHERE id = ? AND user_id = ?",
  )
    .bind(id, user.sub)
    .first<InvestmentRow>();
  if (!existing) throw new HTTPException(404, { message: "Investment not found" });

  const name = body?.name != null ? String(body.name).trim() : existing.name;
  const type = body?.type != null ? String(body.type) : existing.type;
  const investedP =
    body?.invested != null ? toPaise(Number(body.invested)) : existing.invested_amount;
  const currentP =
    body?.current != null ? toPaise(Number(body.current)) : existing.current_value;
  const notes =
    body?.notes !== undefined ? (body.notes ? String(body.notes).trim().slice(0, 2000) : null) : existing.notes;

  if (!name) throw new HTTPException(400, { message: "Name is required" });
  if (!INVESTMENT_TYPES.includes(type as InvestmentType))
    throw new HTTPException(400, { message: "Invalid investment type" });
  if (!Number.isFinite(investedP) || investedP < 0)
    throw new HTTPException(400, { message: "Invested amount must be a non-negative number" });
  if (!Number.isFinite(currentP) || currentP < 0)
    throw new HTTPException(400, { message: "Current value must be a non-negative number" });

  const updated = await c.env.DB.prepare(
    `UPDATE investments
     SET name = ?, type = ?, invested_amount = ?, current_value = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(name, type, investedP, currentP, notes, id, user.sub)
    .first<InvestmentRow>();

  return c.json({ investment: serialize(updated!) });
});

/** DELETE /api/investments/:id */
investments.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM investments WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Investment not found" });
  return c.json({ ok: true });
});

export default investments;
