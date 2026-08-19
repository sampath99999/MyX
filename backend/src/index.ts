import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import authRoutes from "./routes/auth";
import txRoutes from "./routes/transactions";
import goalRoutes from "./routes/goals";
import recurringRoutes from "./routes/recurring";
import budgetRoutes from "./routes/budgets";
import loanRoutes from "./routes/loans";
import investmentRoutes from "./routes/investments";
import moneyDashboardRoutes from "./routes/money-dashboard";
import spaceRoutes from "./routes/spaces";
import projectRoutes from "./routes/projects";
import taskRoutes from "./routes/tasks";
import labelRoutes from "./routes/labels";
import folderRoutes from "./routes/folders";
import noteRoutes from "./routes/notes";
import checklistRoutes from "./routes/checklists";
import memoryRoutes from "./routes/memories";
import { requireAuth } from "./middleware";
import { apiRateLimit } from "./lib/apilimit";
import { runDailyMaintenance } from "./lib/usage";
import { isAllowedOrigin } from "./lib/origins";
import type { AppBindings, Env } from "./types";

const app = new Hono<AppBindings>();

// CORS — allow the Pages frontend (and localhost during dev) to call the API.
// Anything else gets no CORS headers back, so the browser blocks the response.
app.use(
  "*",
  cors({
    origin: (origin, c) => (isAllowedOrigin(origin, c.env.ALLOWED_ORIGINS) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Flood protection in front of everything under /api. Health stays outside it
// so an uptime check can never be throttled.
app.use("/api/*", apiRateLimit);

app.get("/", (c) => c.json({ name: c.env.APP_NAME, status: "ok" }));
app.get("/api/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

app.route("/api/auth", authRoutes);
app.route("/api/transactions", txRoutes);
app.route("/api/goals", goalRoutes);
app.route("/api/recurring", recurringRoutes);
app.route("/api/budgets", budgetRoutes);
app.route("/api/loans", loanRoutes);
app.route("/api/investments", investmentRoutes);
app.route("/api/money", moneyDashboardRoutes);
app.route("/api/spaces", spaceRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/labels", labelRoutes);
app.route("/api/folders", folderRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/checklists", checklistRoutes);
app.route("/api/memories", memoryRoutes);

// Dashboard rollup across every module.
app.get("/api/dashboard/summary", requireAuth, async (c) => {
  const user = c.get("user");
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const money = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type='income'  THEN amount END), 0) AS income,
       COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) AS expense,
       COALESCE(SUM(CASE WHEN type='expense' AND occurred_on LIKE ?1 THEN amount END), 0) AS month_expense
     FROM transactions WHERE user_id = ?2`,
  )
    .bind(`${monthPrefix}%`, user.sub)
    .first<{ income: number; expense: number; month_expense: number }>();

  /*
    These three were hardcoded to 0 long after Tasks, Notes and Checklists
    shipped, so the first screen of the app quietly reported nothing existed.
    One round trip for all of them — three COUNTs over indexed user_id columns
    is cheaper than three separate D1 calls from the edge.
  */
  const counts = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM tasks      WHERE user_id = ?1 AND status = 'open') AS open_tasks,
       (SELECT COUNT(*) FROM notes      WHERE user_id = ?1 AND archived = 0)    AS notes,
       (SELECT COUNT(*) FROM checklists WHERE user_id = ?1)                     AS checklists`,
  )
    .bind(user.sub)
    .first<{ open_tasks: number; notes: number; checklists: number }>();

  /*
    The two dashboard panels. Both were shipped as hardcoded placeholder markup
    when the shell predated the modules, and stayed that way after the modules
    existed — "Recent activity" showed an empty state over any amount of data,
    and the checklist card showed four fake items. Fetched here rather than as
    separate calls so the dashboard stays one round trip.
  */
  const recent = await c.env.DB.prepare(
    `SELECT id, type, amount, category, note, occurred_on FROM transactions
      WHERE user_id = ?1 ORDER BY occurred_on DESC, id DESC LIMIT 5`,
  )
    .bind(user.sub)
    .all<{
      id: number;
      type: string;
      amount: number;
      category: string;
      note: string | null;
      occurred_on: string;
    }>();

  /*
    What actually needs the user today: tasks due or overdue, and bills due
    inside a week. A dashboard that only totals things is a report; this is the
    part that makes it worth opening in the morning.
  */
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const dueTasks = await c.env.DB.prepare(
    `SELECT id, title, due_date, priority FROM tasks
      WHERE user_id = ?1 AND status = 'open' AND due_date IS NOT NULL AND due_date <= ?2
      ORDER BY due_date, priority, id LIMIT 5`,
  )
    .bind(user.sub, todayIso)
    .all<{ id: number; title: string; due_date: string; priority: number }>();

  const dueBills = await c.env.DB.prepare(
    `SELECT id, name, amount, next_due FROM recurring
      WHERE user_id = ?1 AND active = 1 AND next_due <= ?2
      ORDER BY next_due, id LIMIT 5`,
  )
    .bind(user.sub, weekAhead)
    .all<{ id: number; name: string; amount: number; next_due: string }>();

  // The user's first checklist (their own ordering), with its items — the card
  // is a live tick-off surface, not a preview.
  const checklist = await c.env.DB.prepare(
    `SELECT id, name, emoji FROM checklists WHERE user_id = ? ORDER BY position, id LIMIT 1`,
  )
    .bind(user.sub)
    .first<{ id: number; name: string; emoji: string | null }>();

  const checklistItems = checklist
    ? (
        await c.env.DB.prepare(
          `SELECT id, title, done FROM checklist_items
            WHERE checklist_id = ? ORDER BY position, id LIMIT 6`,
        )
          .bind(checklist.id)
          .all<{ id: number; title: string; done: number }>()
      ).results ?? []
    : [];

  const balance = ((money?.income ?? 0) - (money?.expense ?? 0)) / 100;
  const monthSpend = (money?.month_expense ?? 0) / 100;

  return c.json({
    greeting: `Welcome back, ${user.name.split(" ")[0]}`,
    stats: {
      balance,
      monthSpend,
      openTasks: counts?.open_tasks ?? 0,
      notes: counts?.notes ?? 0,
      checklists: counts?.checklists ?? 0,
    },
    today: {
      tasks: dueTasks.results ?? [],
      bills: (dueBills.results ?? []).map((b) => ({ ...b, amount: b.amount / 100 })),
    },
    recent: (recent.results ?? []).map((t) => ({ ...t, amount: t.amount / 100 })),
    checklist: checklist
      ? {
          ...checklist,
          items: checklistItems.map((i) => ({ ...i, done: Boolean(i.done) })),
        }
      : null,
  });
});

// Uniform JSON error responses.
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

/*
  Exporting the Hono app directly leaves no room for a scheduled handler, so the
  Worker exports an object: fetch stays exactly as it was, and scheduled runs the
  daily sweep + quota report (see lib/usage.ts and the cron in wrangler.jsonc).
*/
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runDailyMaintenance(env).catch((err) => {
        console.error("[usage] daily maintenance failed:", err);
      }),
    );
  },
};
