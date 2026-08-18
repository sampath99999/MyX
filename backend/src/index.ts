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
import { isAllowedOrigin } from "./lib/origins";
import type { AppBindings } from "./types";

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

// Dashboard rollup. Money numbers are real; other modules are placeholders for now.
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

  const balance = ((money?.income ?? 0) - (money?.expense ?? 0)) / 100;
  const monthSpend = (money?.month_expense ?? 0) / 100;

  return c.json({
    greeting: `Welcome back, ${user.name.split(" ")[0]}`,
    stats: {
      balance,
      monthSpend,
      // Real numbers land as each module ships.
      openTasks: 0,
      notes: 0,
      checklists: 0,
    },
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

export default app;
