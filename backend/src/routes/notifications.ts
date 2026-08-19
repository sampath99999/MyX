import { Hono } from "hono";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

/*
  What currently wants the user's attention, for the bell in the header.

  There is deliberately no notifications table and no read/unread state. These
  are not events that happened, they are conditions that are true right now: a
  task is overdue until it is done, a budget is over until the month turns. A
  stored feed would need marking read, would go stale against the data it
  describes, and would let someone dismiss an overdue bill by tapping a bell.

  So the bell reads live and the only way to clear an item is to deal with it.
*/

const notifications = new Hono<AppBindings>();
notifications.use("*", requireAuth);

/** Bills this far ahead count as "coming up". Beyond that it is not news yet. */
const BILL_LOOKAHEAD_DAYS = 3;
const PER_KIND = 5;

type Severity = "urgent" | "warning" | "info";

interface Item {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  detail: string | null;
  /** In-app destination, so the bell is a way to act rather than just to read. */
  to: string;
  date: string | null;
}

const addDays = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** GET /api/notifications — live attention items, most urgent first. */
notifications.get("/", async (c) => {
  const user = c.get("user");
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, BILL_LOOKAHEAD_DAYS);
  const monthPrefix = `${today.slice(0, 7)}%`;

  const [tasks, bills, budgets] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, title, due_date FROM tasks
        WHERE user_id = ?1 AND status = 'open' AND due_date IS NOT NULL AND due_date <= ?2
        ORDER BY due_date, priority, id LIMIT ${PER_KIND * 2}`,
    ).bind(user.sub, today),

    c.env.DB.prepare(
      `SELECT id, name, amount, next_due, type FROM recurring
        WHERE user_id = ?1 AND active = 1 AND next_due <= ?2
        ORDER BY next_due, id LIMIT ${PER_KIND}`,
    ).bind(user.sub, horizon),

    /*
      Spent against each budget, this month. The LEFT JOIN matters: a category
      with a limit and no spending yet must still come back, or the arithmetic
      below silently skips it.
    */
    c.env.DB.prepare(
      `SELECT b.category, b.amount AS limit_amount,
              COALESCE(SUM(t.amount), 0) AS spent
         FROM budgets b
         LEFT JOIN transactions t
           ON t.user_id = b.user_id AND t.category = b.category
          AND t.type = 'expense' AND t.occurred_on LIKE ?2
        WHERE b.user_id = ?1
        GROUP BY b.category, b.amount`,
    ).bind(user.sub, monthPrefix),
  ]);

  const items: Item[] = [];

  for (const t of (tasks.results ?? []) as { id: number; title: string; due_date: string }[]) {
    const overdue = t.due_date < today;
    items.push({
      id: `task:${t.id}`,
      kind: "task",
      severity: overdue ? "urgent" : "warning",
      title: t.title,
      detail: overdue ? `Overdue since ${t.due_date}` : "Due today",
      to: "/tasks",
      date: t.due_date,
    });
  }

  for (const b of (bills.results ?? []) as {
    id: number;
    name: string;
    amount: number;
    next_due: string;
    type: string;
  }[]) {
    const overdue = b.next_due < today;
    items.push({
      id: `bill:${b.id}`,
      kind: "bill",
      severity: overdue ? "urgent" : "warning",
      title: b.name,
      detail: `${money(b.amount)} ${overdue ? `was due ${b.next_due}` : `due ${b.next_due}`}`,
      to: "/money/recurring",
      date: b.next_due,
    });
  }

  for (const b of (budgets.results ?? []) as {
    category: string;
    limit_amount: number;
    spent: number;
  }[]) {
    const ratio = b.limit_amount > 0 ? b.spent / b.limit_amount : 0;
    // Under 80% is not news. Over 100% is, and so is the approach to it —
    // a warning after the money is gone is a receipt, not a warning.
    if (ratio < 0.8) continue;
    const over = ratio >= 1;
    items.push({
      id: `budget:${b.category}`,
      kind: "budget",
      severity: over ? "urgent" : "info",
      title: `${b.category} budget`,
      detail: over
        ? `${money(b.spent)} spent of ${money(b.limit_amount)} — over by ${money(b.spent - b.limit_amount)}`
        : `${Math.round(ratio * 100)}% used — ${money(b.limit_amount - b.spent)} left this month`,
      to: "/money/budgets",
      date: null,
    });
  }

  const rank: Record<Severity, number> = { urgent: 0, warning: 1, info: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.date ?? "").localeCompare(b.date ?? ""));

  return c.json({
    items,
    count: items.length,
    urgent: items.filter((i) => i.severity === "urgent").length,
  });
});

export default notifications;
