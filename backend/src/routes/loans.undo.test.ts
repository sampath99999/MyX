/*
  Undoing a loan payment.

  This exists because of a real incident: a ₹25,000 prepayment was recorded,
  then its expense was deleted from the Money module in the belief that this
  undid it. It did not — the loan kept the reduced balance, and the money module
  had no record of the payment. Recording a payment writes three things and
  nothing could take any of them back.
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function call(path: string, method: string, body?: unknown) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/loans", loanRoutes as Hono<AppBindings, any, any>);

  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { DB: t.db, JWT_SECRET, APP_NAME: "MyX" },
  );
}

const OUTSTANDING = 100000000; // ₹10,00,000 in paise

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare("INSERT INTO users (id, email, name, password_hash) VALUES (1, 'a@b.co', 'A', 'x')")
    .run();
  t.raw
    .prepare(
      `INSERT INTO loans (id, user_id, name, principal, annual_rate, emi, outstanding, start_date)
       VALUES (1, 1, 'Zolve', ?, 14.99, 883800, ?, '2026-01-01')`,
    )
    .run(OUTSTANDING, OUTSTANDING);
  token = await signToken({ id: 1, email: "a@b.co", name: "A", token_version: 0 }, JWT_SECRET);
});
afterEach(() => t.close());

async function prepay(amount: number, key = "k1") {
  const res = await call("/api/loans/1/prepay", "POST", { amount, idempotency_key: key });
  return (await res.json()) as { payment: { balance_after: number } };
}

const loanRow = () =>
  t.raw.prepare("SELECT outstanding, status FROM loans WHERE id = 1").get() as {
    outstanding: number;
    status: string;
  };
const paymentCount = () =>
  (t.raw.prepare("SELECT COUNT(*) AS n FROM loan_payments").get() as { n: number }).n;
const txCount = () =>
  (t.raw.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
const latestPaymentId = () =>
  (t.raw.prepare("SELECT id FROM loan_payments ORDER BY id DESC LIMIT 1").get() as { id: number }).id;

describe("undoing a payment", () => {
  it("restores the outstanding balance", async () => {
    await prepay(25000);
    expect(loanRow().outstanding).toBe(OUTSTANDING - 25000_00);

    const res = await call(`/api/loans/1/payments/${latestPaymentId()}`, "DELETE");
    expect(res.status).toBe(200);
    expect(loanRow().outstanding).toBe(OUTSTANDING);
  });

  it("removes the payment row", async () => {
    await prepay(25000);
    await call(`/api/loans/1/payments/${latestPaymentId()}`, "DELETE");
    expect(paymentCount()).toBe(0);
  });

  it("removes the expense it booked, which deleting the expense alone never did", async () => {
    await prepay(25000);
    expect(txCount()).toBe(1);

    await call(`/api/loans/1/payments/${latestPaymentId()}`, "DELETE");
    expect(txCount()).toBe(0);
  });

  it("reopens a loan that the payment had closed", async () => {
    await prepay(OUTSTANDING / 100);
    expect(loanRow().status).toBe("closed");

    await call(`/api/loans/1/payments/${latestPaymentId()}`, "DELETE");
    expect(loanRow()).toMatchObject({ outstanding: OUTSTANDING, status: "active" });
  });

  it("puts back only the principal, since interest was never in the balance", async () => {
    await call("/api/loans/1/pay", "POST", { idempotency_key: "emi1" });
    const payment = t.raw
      .prepare("SELECT id, interest_part, principal_part FROM loan_payments")
      .get() as { id: number; interest_part: number; principal_part: number };
    expect(payment.interest_part).toBeGreaterThan(0);

    await call(`/api/loans/1/payments/${payment.id}`, "DELETE");
    expect(loanRow().outstanding).toBe(OUTSTANDING);
  });

  it("refuses to undo anything but the most recent payment", async () => {
    await prepay(10000, "k1");
    const first = latestPaymentId();
    await prepay(10000, "k2");

    /*
      Every payment stores the balance as it stood after it, so removing one
      from the middle would leave later rows describing a history that never
      happened.
    */
    const res = await call(`/api/loans/1/payments/${first}`, "DELETE");
    expect(res.status).toBe(400);
    expect(paymentCount()).toBe(2);
  });

  it("undoes repeatedly, newest first", async () => {
    await prepay(10000, "k1");
    await prepay(10000, "k2");

    await call(`/api/loans/1/payments/${latestPaymentId()}`, "DELETE");
    await call(`/api/loans/1/payments/${latestPaymentId()}`, "DELETE");

    expect(paymentCount()).toBe(0);
    expect(loanRow().outstanding).toBe(OUTSTANDING);
  });

  it("still reverses the loan when the expense was already deleted by hand", async () => {
    // Exactly the state the incident left behind.
    await prepay(25000);
    t.raw.prepare("DELETE FROM transactions").run();

    const res = await call(`/api/loans/1/payments/${latestPaymentId()}`, "DELETE");
    expect(res.status).toBe(200);
    expect(loanRow().outstanding).toBe(OUTSTANDING);
  });

  it("reports nothing to undo on a loan with no payments", async () => {
    const res = await call("/api/loans/1/payments/999", "DELETE");
    expect(res.status).toBe(404);
  });

  it("will not undo another user's payment", async () => {
    await prepay(25000);
    const paymentId = latestPaymentId();

    t.raw
      .prepare("INSERT INTO users (id, email, name, password_hash) VALUES (2, 'b@b.co', 'B', 'x')")
      .run();
    const saved = token;
    token = await signToken({ id: 2, email: "b@b.co", name: "B", token_version: 0 }, JWT_SECRET);
    const res = await call(`/api/loans/1/payments/${paymentId}`, "DELETE");
    token = saved;

    expect(res.status).toBe(404);
    expect(paymentCount()).toBe(1);
  });
});
