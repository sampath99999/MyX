import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const goals = new Hono<AppBindings>();
goals.use("*", requireAuth);

interface GoalRow {
  id: number;
  name: string;
  emoji: string | null;
  target_amount: number; // paise
  saved_amount: number; // paise
  target_date: string | null;
  created_at: string;
  completed_at: string | null;
}

const toPaise = (r: number) => Math.round(r * 100);
const toRupees = (p: number) => p / 100;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function serialize(g: GoalRow) {
  const target = toRupees(g.target_amount);
  const saved = toRupees(g.saved_amount);
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    target,
    saved,
    remaining: Math.max(target - saved, 0),
    percent: g.target_amount > 0 ? Math.min(Math.round((g.saved_amount / g.target_amount) * 100), 100) : 0,
    target_date: g.target_date,
    created_at: g.created_at,
    completed_at: g.completed_at,
  };
}

/** GET /api/goals — list, newest first. */
goals.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM goals WHERE user_id = ? ORDER BY completed_at IS NOT NULL, created_at DESC",
  )
    .bind(user.sub)
    .all<GoalRow>();
  return c.json({ goals: (results ?? []).map(serialize) });
});

/** POST /api/goals — create. Body: { name, target, saved?, emoji?, target_date? } */
goals.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const name = String(body?.name ?? "").trim();
  const target = Number(body?.target);
  const saved = body?.saved != null ? Number(body.saved) : 0;
  const emoji = body?.emoji ? String(body.emoji).trim().slice(0, 8) : null;
  const target_date = body?.target_date ? String(body.target_date) : null;

  if (!name) throw new HTTPException(400, { message: "Goal name is required" });
  if (!Number.isFinite(target) || target <= 0)
    throw new HTTPException(400, { message: "Target must be a positive amount" });
  if (!Number.isFinite(saved) || saved < 0)
    throw new HTTPException(400, { message: "Saved amount cannot be negative" });
  if (target_date && !dateRe.test(target_date))
    throw new HTTPException(400, { message: "target_date must be YYYY-MM-DD" });

  const savedP = toPaise(saved);
  const targetP = toPaise(target);
  const completed = savedP >= targetP ? new Date().toISOString() : null;

  const created = await c.env.DB.prepare(
    `INSERT INTO goals (user_id, name, emoji, target_amount, saved_amount, target_date, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(user.sub, name, emoji, targetP, savedP, target_date, completed)
    .first<GoalRow>();

  if (!created) throw new HTTPException(500, { message: "Failed to create goal" });
  return c.json({ goal: serialize(created) }, 201);
});

/** POST /api/goals/:id/contribute — add (or withdraw with negative) funds. Body: { amount } */
goals.post("/:id/contribute", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const amount = Number(body?.amount);

  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  if (!Number.isFinite(amount) || amount === 0)
    throw new HTTPException(400, { message: "amount must be a non-zero number" });

  const goal = await c.env.DB.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<GoalRow>();
  if (!goal) throw new HTTPException(404, { message: "Goal not found" });

  const nextSaved = Math.max(goal.saved_amount + toPaise(amount), 0);
  const completed =
    nextSaved >= goal.target_amount ? (goal.completed_at ?? new Date().toISOString()) : null;

  const updated = await c.env.DB.prepare(
    "UPDATE goals SET saved_amount = ?, completed_at = ? WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(nextSaved, completed, id, user.sub)
    .first<GoalRow>();

  return c.json({ goal: serialize(updated!) });
});

/** PATCH /api/goals/:id — edit name / target / emoji / target_date. */
goals.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const goal = await c.env.DB.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<GoalRow>();
  if (!goal) throw new HTTPException(404, { message: "Goal not found" });

  const name = body?.name != null ? String(body.name).trim() : goal.name;
  const emoji = body?.emoji !== undefined ? (body.emoji ? String(body.emoji).slice(0, 8) : null) : goal.emoji;
  const targetP = body?.target != null ? toPaise(Number(body.target)) : goal.target_amount;
  const target_date =
    body?.target_date !== undefined ? (body.target_date || null) : goal.target_date;

  if (!name) throw new HTTPException(400, { message: "Goal name is required" });
  if (!Number.isFinite(targetP) || targetP <= 0)
    throw new HTTPException(400, { message: "Target must be a positive amount" });
  if (target_date && !dateRe.test(target_date))
    throw new HTTPException(400, { message: "target_date must be YYYY-MM-DD" });

  const completed = goal.saved_amount >= targetP ? (goal.completed_at ?? new Date().toISOString()) : null;

  const updated = await c.env.DB.prepare(
    "UPDATE goals SET name = ?, emoji = ?, target_amount = ?, target_date = ?, completed_at = ? WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(name, emoji, targetP, target_date, completed, id, user.sub)
    .first<GoalRow>();

  return c.json({ goal: serialize(updated!) });
});

/** DELETE /api/goals/:id */
goals.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Goal not found" });
  return c.json({ ok: true });
});

export default goals;
