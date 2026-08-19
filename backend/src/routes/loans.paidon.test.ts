/*
  The payment date on "Pay EMI".

  It is not a label. paid_on is also the date of the expense the payment books,
  so it decides which month's spending, budgets and cash-flow bar the instalment
  lands in. Recording July's EMI in August with today's date silently corrupts
  both months.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import loanRoutes from "./loans";
import { createTestDb, type TestDb } from "../test-support/d1";
import { signToken } from "../lib/auth";
import type { AppBindings } from "../types";

let t: TestDb;
let token: string;

const JWT_SECRET = "test-secret";

function request(body: unknown) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/loans", loanRoutes);

  return app.request(
    "/api/loans/1/pay",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
    { DB: t.db, JWT_SECRET, APP_NAME: "MyX" },
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare("INSERT INTO users (id, email, name, password_hash) VALUES (1, 'a@b.co', 'A', 'x')")
    .run();
  t.raw
    .prepare(
      `INSERT INTO loans (id, user_id, name, principal, annual_rate, emi, outstanding, start_date)
       VALUES (1, 1, 'Home', 2200000000, 9.9, 2108500, 2200000000, '2026-01-01')`,
    )
    .run();
  token = await signToken({ id: 1, email: "a@b.co", name: "A", token_version: 0 }, JWT_SECRET);
});
afterEach(() => t.close());

describe("paid_on", () => {
  it("defaults to today when the caller does not send one", async () => {
    const res = await request({ idempotency_key: "k1" });
    expect(res.status).toBe(200);

    const row = t.raw.prepare("SELECT paid_on FROM loan_payments").get() as { paid_on: string };
    expect(row.paid_on).toBe(today());
  });

  it("records the date the caller gives", async () => {
    const res = await request({ idempotency_key: "k1", paid_on: "2026-07-05" });
    expect(res.status).toBe(200);

    const row = t.raw.prepare("SELECT paid_on FROM loan_payments").get() as { paid_on: string };
    expect(row.paid_on).toBe("2026-07-05");
  });

  it("dates the booked expense the same way, so it counts in that month", async () => {
    // The whole point: a July payment logged in August belongs to July's
    // spending, not August's.
    await request({ idempotency_key: "k1", paid_on: "2026-07-05", log_transaction: true });

    const tx = t.raw
      .prepare("SELECT occurred_on, category FROM transactions")
      .get() as { occurred_on: string; category: string };
    expect(tx.occurred_on).toBe("2026-07-05");
    expect(tx.category).toBe("Loan EMI");
  });

  it("rejects a future date rather than accepting a payment not yet made", async () => {
    const res = await request({ idempotency_key: "k1", paid_on: daysFromNow(3) });
    expect(res.status).toBe(400);

    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM loan_payments").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("rejects a malformed date instead of quietly using today", async () => {
    // Silently mis-dating a financial record is worse than refusing it.
    const res = await request({ idempotency_key: "k1", paid_on: "05/07/2026" });
    expect(res.status).toBe(400);

    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM loan_payments").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("still collapses a replay of the same intent, whatever the date", async () => {
    await request({ idempotency_key: "same", paid_on: "2026-07-05" });
    await request({ idempotency_key: "same", paid_on: "2026-07-05" });

    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM loan_payments").get() as { n: number };
    expect(row.n).toBe(1);
  });
});
