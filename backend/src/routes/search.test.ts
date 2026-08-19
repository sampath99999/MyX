/*
  Cross-module search and the header's notification bell, through the real Hono
  apps against real SQLite.

  The property that matters most is the boring one: neither of these may ever
  show a row belonging to somebody else. They read from ten and three tables
  respectively, and a single missing user_id predicate would leak.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import searchRoutes from "./search";
import notificationRoutes from "./notifications";
import recurringRoutes from "./recurring";
import { createTestDb, type TestDb } from "../test-support/d1";
import { signToken } from "../lib/auth";
import type { AppBindings } from "../types";

let t: TestDb;
let mine: string;
let theirs: string;
const JWT_SECRET = "test-secret";

/* eslint-disable @typescript-eslint/no-explicit-any */
function call(path: string, token: string, method = "GET", body?: unknown) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/search", searchRoutes as Hono<AppBindings, any, any>);
  app.route("/api/notifications", notificationRoutes as Hono<AppBindings, any, any>);
  app.route("/api/recurring", recurringRoutes as Hono<AppBindings, any, any>);

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

const json = async (res: Response) => (await res.json()) as any;
const today = () => new Date().toISOString().slice(0, 10);
const shiftDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare(
      `INSERT INTO users (id, email, name, password_hash) VALUES
         (1, 'me@x.co', 'Me', 'x'), (2, 'them@x.co', 'Them', 'x')`,
    )
    .run();
  t.raw.prepare("INSERT INTO spaces (id, user_id, name) VALUES (1, 1, 'Personal')").run();

  mine = await signToken({ id: 1, email: "me@x.co", name: "Me", token_version: 0 }, JWT_SECRET);
  theirs = await signToken({ id: 2, email: "them@x.co", name: "Them", token_version: 0 }, JWT_SECRET);
});
afterEach(() => t.close());

describe("GET /api/search", () => {
  beforeEach(() => {
    t.raw
      .prepare(
        `INSERT INTO transactions (user_id, type, amount, category, note, occurred_on)
         VALUES (1, 'expense', 250000, 'Loans', 'Zolve EMI', '2026-08-07')`,
      )
      .run();
    t.raw
      .prepare(
        "INSERT INTO loans (user_id, name, lender, principal, annual_rate, emi, outstanding, start_date) VALUES (1, 'Zolve', 'Zolve Card', 500000, 14, 25000, 182751, '2026-01-01')",
      )
      .run();
    t.raw
      .prepare("INSERT INTO notes (user_id, title, content, tags) VALUES (1, 'Wifi', 'zolve backup code', 'keys')")
      .run();
    t.raw.prepare("INSERT INTO tasks (user_id, space_id, title) VALUES (1, 1, 'Close Zolve card')").run();
  });

  it("reaches across every module in one query", async () => {
    const body = await json(await call("/api/search?q=zolve", mine));
    const kinds = body.results.map((r: any) => r.kind);
    // The point of the feature: one search, four different tables.
    expect(new Set(kinds)).toEqual(new Set(["transaction", "loan", "note", "task"]));
  });

  it("never returns another account's rows", async () => {
    const body = await json(await call("/api/search?q=zolve", theirs));
    expect(body.results).toHaveLength(0);
  });

  it("converts money to rupees and leaves everything else alone", async () => {
    const body = await json(await call("/api/search?q=zolve", mine));
    const loan = body.results.find((r: any) => r.kind === "loan");
    const task = body.results.find((r: any) => r.kind === "task");
    expect(loan.amount).toBe(1827.51);
    expect(task.amount).toBeNull();
  });

  it("answers with nothing below two characters", async () => {
    // Otherwise every single-letter keystroke scans ten tables to return half
    // the account.
    expect((await json(await call("/api/search?q=z", mine))).results).toHaveLength(0);
    expect((await json(await call("/api/search?q=", mine))).results).toHaveLength(0);
  });

  it("treats LIKE wildcards as ordinary characters", async () => {
    /*
      Unescaped, "%" matches everything — a user searching for a literal percent
      sign would get their entire account back, which looks like the search is
      broken in the other direction.
    */
    const body = await json(await call("/api/search?q=%25", mine));
    expect(body.results).toHaveLength(0);
  });

  it("needs a session", async () => {
    const app = new Hono<AppBindings>();
    app.route("/api/search", searchRoutes as Hono<AppBindings, any, any>);
    const res = await app.request("/api/search?q=zolve", {}, { DB: t.db, JWT_SECRET, APP_NAME: "MyX" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/notifications", () => {
  it("reports overdue tasks as urgent and today's as a warning", async () => {
    t.raw
      .prepare("INSERT INTO tasks (user_id, space_id, title, due_date) VALUES (1, 1, 'Pay rent', ?)")
      .run(shiftDays(-3));
    t.raw
      .prepare("INSERT INTO tasks (user_id, space_id, title, due_date) VALUES (1, 1, 'Call bank', ?)")
      .run(today());

    const body = await json(await call("/api/notifications", mine));
    const bySeverity = Object.fromEntries(body.items.map((i: any) => [i.title, i.severity]));
    expect(bySeverity["Pay rent"]).toBe("urgent");
    expect(bySeverity["Call bank"]).toBe("warning");
    expect(body.urgent).toBe(1);
  });

  it("leaves a task due next week alone", async () => {
    t.raw
      .prepare("INSERT INTO tasks (user_id, space_id, title, due_date) VALUES (1, 1, 'Later', ?)")
      .run(shiftDays(7));
    expect((await json(await call("/api/notifications", mine))).items).toHaveLength(0);
  });

  it("warns on a budget nearing its limit and escalates once it is past", async () => {
    const month = today().slice(0, 7);
    t.raw.prepare("INSERT INTO budgets (user_id, category, amount) VALUES (1, 'Food', 100000)").run();
    t.raw
      .prepare(
        "INSERT INTO transactions (user_id, type, amount, category, occurred_on) VALUES (1, 'expense', 85000, 'Food', ?)",
      )
      .run(`${month}-01`);

    const warned = await json(await call("/api/notifications", mine));
    expect(warned.items[0]).toMatchObject({ kind: "budget", severity: "info" });

    t.raw
      .prepare(
        "INSERT INTO transactions (user_id, type, amount, category, occurred_on) VALUES (1, 'expense', 30000, 'Food', ?)",
      )
      .run(`${month}-02`);

    const over = await json(await call("/api/notifications", mine));
    expect(over.items[0]).toMatchObject({ kind: "budget", severity: "urgent" });
    expect(over.items[0].detail).toContain("over by");
  });

  it("says nothing about a budget with room left in it", async () => {
    const month = today().slice(0, 7);
    t.raw.prepare("INSERT INTO budgets (user_id, category, amount) VALUES (1, 'Food', 100000)").run();
    t.raw
      .prepare(
        "INSERT INTO transactions (user_id, type, amount, category, occurred_on) VALUES (1, 'expense', 20000, 'Food', ?)",
      )
      .run(`${month}-01`);

    expect((await json(await call("/api/notifications", mine))).items).toHaveLength(0);
  });

  it("does not see another account's overdue anything", async () => {
    t.raw
      .prepare("INSERT INTO tasks (user_id, space_id, title, due_date) VALUES (1, 1, 'Mine', ?)")
      .run(shiftDays(-1));
    expect((await json(await call("/api/notifications", theirs))).items).toHaveLength(0);
  });
});

describe("GET /api/recurring/suggestions", () => {
  /** Three identical monthly payments — the smallest thing worth proposing. */
  function seedMonthly(note: string, category = "Subscriptions") {
    for (const month of ["2026-06", "2026-07", "2026-08"]) {
      t.raw
        .prepare(
          "INSERT INTO transactions (user_id, type, amount, category, note, occurred_on) VALUES (1, 'expense', 64900, ?, ?, ?)",
        )
        .run(category, note, `${month}-05`);
    }
  }

  it("proposes a bill it can see in the transactions", async () => {
    seedMonthly("Netflix");
    const body = await json(await call("/api/recurring/suggestions", mine));
    expect(body.suggestions).toHaveLength(1);
    // Rupees at the boundary, like every other money route.
    expect(body.suggestions[0]).toMatchObject({ name: "Netflix", amount: 649, frequency: "monthly" });
  });

  it("does not propose one the user has already set up", async () => {
    seedMonthly("Netflix");
    t.raw
      .prepare(
        "INSERT INTO recurring (user_id, name, type, amount, category, frequency, next_due) VALUES (1, 'NETFLIX', 'expense', 64900, 'Subscriptions', 'monthly', '2026-09-05')",
      )
      .run();

    // Matched on the normalised description, so the rule's casing does not
    // decide whether the suggestion reappears.
    expect((await json(await call("/api/recurring/suggestions", mine))).suggestions).toHaveLength(0);
  });

  it("stops proposing one that was dismissed", async () => {
    seedMonthly("Netflix");
    const first = await json(await call("/api/recurring/suggestions", mine));
    const { signature } = first.suggestions[0];

    await call("/api/recurring/suggestions/dismiss", mine, "POST", { signature });
    expect((await json(await call("/api/recurring/suggestions", mine))).suggestions).toHaveLength(0);

    // And it stays dismissed — dismissing twice must not resurrect it.
    await call("/api/recurring/suggestions/dismiss", mine, "POST", { signature });
    expect((await json(await call("/api/recurring/suggestions", mine))).suggestions).toHaveLength(0);
  });

  it("keeps one account's dismissals out of another's suggestions", async () => {
    seedMonthly("Netflix");
    const { suggestions } = await json(await call("/api/recurring/suggestions", mine));
    await call("/api/recurring/suggestions/dismiss", theirs, "POST", {
      signature: suggestions[0].signature,
    });
    expect((await json(await call("/api/recurring/suggestions", mine))).suggestions).toHaveLength(1);
  });

  it("is not confused by the route being called 'suggestions'", async () => {
    // /suggestions has to be matched before /:id, or this reads as an id.
    const res = await call("/api/recurring/suggestions", mine);
    expect(res.status).toBe(200);
  });
});
