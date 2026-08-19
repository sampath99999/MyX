/*
  Correcting a transaction, and paying a lump sum off a loan.

  Both write money. The properties worth pinning are that an edit cannot put a
  row into a state the create endpoint would have rejected, and that a
  prepayment goes entirely to principal — the thing that makes it worth doing.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import txRoutes from "./transactions";
import loanRoutes from "./loans";
import { createTestDb, type TestDb } from "../test-support/d1";
import { signToken } from "../lib/auth";
import type { AppBindings } from "../types";

let t: TestDb;
let token: string;
const JWT_SECRET = "test-secret";

/* eslint-disable @typescript-eslint/no-explicit-any */
function call(mount: string, routes: Hono<AppBindings, any, any>) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route(mount, routes);

  return (path: string, method: string, body?: unknown) =>
    app.request(
      path,
      {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { DB: t.db, JWT_SECRET, APP_NAME: "MyX" },
    );
}

const tx = () => call("/api/transactions", txRoutes);
const loans = () => call("/api/loans", loanRoutes);

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare("INSERT INTO users (id, email, name, password_hash) VALUES (1, 'a@b.co', 'A', 'x')")
    .run();
  token = await signToken({ id: 1, email: "a@b.co", name: "A", token_version: 0 }, JWT_SECRET);
});
afterEach(() => t.close());

describe("PATCH /api/transactions/:id", () => {
  async function seed() {
    const res = await tx()("/api/transactions", "POST", {
      type: "expense",
      amount: 2400,
      category: "Food",
      note: "Groceries",
      occurred_on: "2026-08-10",
    });
    return ((await res.json()) as { transaction: { id: number } }).transaction.id;
  }

  it("corrects a mistyped amount", async () => {
    const id = await seed();
    const res = await tx()(`/api/transactions/${id}`, "PATCH", { amount: 24000 });
    expect(res.status).toBe(200);

    const row = t.raw.prepare("SELECT amount FROM transactions WHERE id = ?").get(id) as {
      amount: number;
    };
    expect(row.amount).toBe(24000_00);
  });

  it("leaves untouched fields alone", async () => {
    const id = await seed();
    await tx()(`/api/transactions/${id}`, "PATCH", { amount: 2500 });

    const row = t.raw
      .prepare("SELECT category, note, occurred_on, type FROM transactions WHERE id = ?")
      .get(id) as { category: string; note: string; occurred_on: string; type: string };
    expect(row).toMatchObject({
      category: "Food",
      note: "Groceries",
      occurred_on: "2026-08-10",
      type: "expense",
    });
  });

  it("moves a transaction to another date, which moves which month it counts in", async () => {
    const id = await seed();
    await tx()(`/api/transactions/${id}`, "PATCH", { occurred_on: "2026-07-30" });

    const row = t.raw.prepare("SELECT occurred_on FROM transactions WHERE id = ?").get(id) as {
      occurred_on: string;
    };
    expect(row.occurred_on).toBe("2026-07-30");
  });

  it("can clear a note", async () => {
    const id = await seed();
    await tx()(`/api/transactions/${id}`, "PATCH", { note: null });

    const row = t.raw.prepare("SELECT note FROM transactions WHERE id = ?").get(id) as {
      note: string | null;
    };
    expect(row.note).toBeNull();
  });

  it("refuses values the create endpoint would refuse", async () => {
    const id = await seed();
    for (const bad of [{ amount: -5 }, { amount: 0 }, { category: "  " }, { type: "transfer" }]) {
      expect((await tx()(`/api/transactions/${id}`, "PATCH", bad)).status).toBe(400);
    }
    expect((await tx()(`/api/transactions/${id}`, "PATCH", { occurred_on: "10-08-2026" })).status).toBe(400);
  });

  it("will not edit someone else's transaction", async () => {
    const id = await seed();
    t.raw
      .prepare("INSERT INTO users (id, email, name, password_hash) VALUES (2, 'b@b.co', 'B', 'x')")
      .run();
    const otherToken = await signToken(
      { id: 2, email: "b@b.co", name: "B", token_version: 0 },
      JWT_SECRET,
    );
    const saved = token;
    token = otherToken;
    const res = await tx()(`/api/transactions/${id}`, "PATCH", { amount: 1 });
    token = saved;

    expect(res.status).toBe(404);
    const row = t.raw.prepare("SELECT amount FROM transactions WHERE id = ?").get(id) as {
      amount: number;
    };
    expect(row.amount).toBe(2400_00);
  });
});

describe("POST /api/loans/:id/prepay", () => {
  beforeEach(() => {
    // ₹10,00,000 at 9% with a ₹12,668 EMI — a live 10-year loan.
    t.raw
      .prepare(
        `INSERT INTO loans (id, user_id, name, principal, annual_rate, emi, outstanding, start_date)
         VALUES (1, 1, 'Home', 100000000, 9, 1266800, 100000000, '2026-01-01')`,
      )
      .run();
  });

  it("puts the whole amount against principal, with no interest", async () => {
    const res = await loans()("/api/loans/1/prepay", "POST", {
      amount: 100000,
      idempotency_key: "p1",
    });
    expect(res.status).toBe(200);

    const row = t.raw
      .prepare("SELECT interest_part, principal_part, kind FROM loan_payments")
      .get() as { interest_part: number; principal_part: number; kind: string };
    expect(row.interest_part).toBe(0);
    expect(row.principal_part).toBe(100000_00);
    expect(row.kind).toBe("prepayment");
  });

  it("reduces the outstanding balance by exactly the amount", async () => {
    await loans()("/api/loans/1/prepay", "POST", { amount: 100000, idempotency_key: "p1" });

    const loan = t.raw.prepare("SELECT outstanding FROM loans WHERE id = 1").get() as {
      outstanding: number;
    };
    expect(loan.outstanding).toBe(100000000 - 100000_00);
  });

  it("reports the interest and months it saved", async () => {
    const res = await loans()("/api/loans/1/prepay", "POST", {
      amount: 100000,
      idempotency_key: "p1",
    });
    const body = (await res.json()) as { saved: { interest: number; months: number } };

    // A lakh off a 9% loan saves far more than a lakh of interest is worth
    // paying — this is the number the calculator page promises.
    expect(body.saved.interest).toBeGreaterThan(0);
    expect(body.saved.months).toBeGreaterThan(0);
  });

  it("closes the loan when the prepayment clears it", async () => {
    const res = await loans()("/api/loans/1/prepay", "POST", {
      amount: 1000000,
      idempotency_key: "p1",
    });
    const body = (await res.json()) as { saved: { closed: boolean } };
    expect(body.saved.closed).toBe(true);

    const loan = t.raw.prepare("SELECT outstanding, status FROM loans WHERE id = 1").get() as {
      outstanding: number;
      status: string;
    };
    expect(loan.outstanding).toBe(0);
    expect(loan.status).toBe("closed");
  });

  it("refuses more than the outstanding balance", async () => {
    const res = await loans()("/api/loans/1/prepay", "POST", {
      amount: 1000001,
      idempotency_key: "p1",
    });
    expect(res.status).toBe(400);

    const loan = t.raw.prepare("SELECT outstanding FROM loans WHERE id = 1").get() as {
      outstanding: number;
    };
    expect(loan.outstanding).toBe(100000000);
  });

  it("books the expense under its own category, dated when it was paid", async () => {
    await loans()("/api/loans/1/prepay", "POST", {
      amount: 50000,
      idempotency_key: "p1",
      paid_on: "2026-07-15",
    });

    const row = t.raw.prepare("SELECT category, occurred_on FROM transactions").get() as {
      category: string;
      occurred_on: string;
    };
    expect(row.category).toBe("Loan prepayment");
    expect(row.occurred_on).toBe("2026-07-15");
  });

  it("collapses a replay instead of paying twice", async () => {
    await loans()("/api/loans/1/prepay", "POST", { amount: 100000, idempotency_key: "same" });
    const second = await loans()("/api/loans/1/prepay", "POST", {
      amount: 100000,
      idempotency_key: "same",
    });
    expect(((await second.json()) as { replayed?: boolean }).replayed).toBe(true);

    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM loan_payments").get() as { n: number };
    expect(row.n).toBe(1);
    const loan = t.raw.prepare("SELECT outstanding FROM loans WHERE id = 1").get() as {
      outstanding: number;
    };
    expect(loan.outstanding).toBe(100000000 - 100000_00);
  });

  it("rejects a future date", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await loans()("/api/loans/1/prepay", "POST", {
      amount: 1000,
      idempotency_key: "p1",
      paid_on: future,
    });
    expect(res.status).toBe(400);
  });
});
