/*
  The daily digest.

  Two properties carry the feature: it must stay quiet on a day with nothing
  due, and it must never send twice. Everything else is formatting.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { collectDue, sendDailyDigests, renderDigest, localDate, addDays, rupees } from "./digest";
import { createTestDb, type TestDb } from "../test-support/d1";
import type { Env } from "../types";

let t: TestDb;
let sent: { to: string; subject: string; text: string }[];

/** test-support types `db` as unknown; the helpers under test want a D1Database. */
const db = () => t.db as D1Database;

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: t.db,
    APP_URL: "https://myx.test",
    EMAIL: {
      send: async (m: { to: string; subject: string; text: string }) => {
        sent.push({ to: m.to, subject: m.subject, text: m.text });
      },
    },
    ...overrides,
  } as unknown as Env;
}

/** 03:15 UTC — when the cron actually fires. In IST that is 08:45 the same day. */
const RUN_AT = new Date("2026-08-19T03:15:00Z");
const TODAY = "2026-08-19";

function addUser(id: number, opts: { verified?: number; digest?: number } = {}) {
  t.raw
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, email_verified, digest_enabled)
       VALUES (?, ?, ?, 'x', ?, ?)`,
    )
    .run(id, `u${id}@example.com`, `User ${id}`, opts.verified ?? 1, opts.digest ?? 1);
}

function addBill(userId: number, name: string, nextDue: string, amount = 2_400_000) {
  t.raw
    .prepare(
      `INSERT INTO recurring (user_id, name, type, amount, category, frequency, next_due, active)
       VALUES (?, ?, 'expense', ?, 'Housing', 'monthly', ?, 1)`,
    )
    .run(userId, name, amount, nextDue);
}

beforeEach(() => {
  t = createTestDb();
  sent = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  t.close();
  vi.restoreAllMocks();
});

describe("date helpers", () => {
  it("resolves the local day, not UTC's", () => {
    // 20:00 UTC is already the next day in IST — a digest built on the UTC date
    // would report the wrong day's bills.
    expect(localDate(new Date("2026-08-19T20:00:00Z"), 330)).toBe("2026-08-20");
    expect(localDate(new Date("2026-08-19T20:00:00Z"), 0)).toBe("2026-08-19");
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats paise with Indian grouping", () => {
    expect(rupees(2_400_000)).toBe("₹24,000");
    expect(rupees(12_48_60_00)).toBe("₹1,24,860");
  });
});

describe("collectDue", () => {
  it("includes bills due today, tomorrow and overdue", async () => {
    addUser(1);
    addBill(1, "Rent", TODAY);
    addBill(1, "Broadband", addDays(TODAY, 1));
    addBill(1, "Gym", addDays(TODAY, -3));
    addBill(1, "Insurance", addDays(TODAY, 30)); // too far out

    const { byUser } = await collectDue(db(), TODAY);
    const names = byUser.get(1)!.bills.map((b) => b.name);
    expect(names).toEqual(["Gym", "Rent", "Broadband"]);
  });

  it("ignores paused bills", async () => {
    addUser(1);
    addBill(1, "Rent", TODAY);
    t.raw.prepare("UPDATE recurring SET active = 0").run();

    const { byUser } = await collectDue(db(), TODAY);
    expect(byUser.get(1)?.bills ?? []).toHaveLength(0);
  });

  it("includes open tasks due today or overdue, but not future or done ones", async () => {
    addUser(1);
    // Every task belongs to a space; the column is NOT NULL.
    t.raw.prepare("INSERT INTO spaces (id, user_id, name) VALUES (1, 1, 'Personal')").run();
    const insert = t.raw.prepare(
      "INSERT INTO tasks (user_id, space_id, title, due_date, status) VALUES (?, 1, ?, ?, ?)",
    );
    insert.run(1, "Pay rent", TODAY, "open");
    insert.run(1, "Old thing", addDays(TODAY, -5), "open");
    insert.run(1, "Next week", addDays(TODAY, 7), "open");
    insert.run(1, "Finished", TODAY, "done");

    const { byUser } = await collectDue(db(), TODAY);
    expect(byUser.get(1)!.tasks.map((x) => x.title)).toEqual(["Old thing", "Pay rent"]);
  });

  it("reports only budgets at or past 90% of their limit", async () => {
    addUser(1);
    const budget = t.raw.prepare("INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)");
    budget.run(1, "Food", 10_000);
    budget.run(1, "Travel", 10_000);
    const tx = t.raw.prepare(
      "INSERT INTO transactions (user_id, type, amount, category, occurred_on) VALUES (?, 'expense', ?, ?, ?)",
    );
    tx.run(1, 9_500, "Food", TODAY); // 95% — worth saying
    tx.run(1, 2_000, "Travel", TODAY); // 20% — not news

    const { byUser } = await collectDue(db(), TODAY);
    expect(byUser.get(1)!.budgets.map((b) => b.category)).toEqual(["Food"]);
  });

  it("leaves out users who opted out or are unverified", async () => {
    addUser(1, { digest: 0 });
    addUser(2, { verified: 0 });
    addUser(3);
    addBill(1, "Rent", TODAY);
    addBill(2, "Rent", TODAY);
    addBill(3, "Rent", TODAY);

    const { recipients } = await collectDue(db(), TODAY);
    expect(recipients.map((r) => r.id)).toEqual([3]);
  });

  it("keeps one user's items out of another's digest", async () => {
    addUser(1);
    addUser(2);
    addBill(1, "Rent", TODAY);
    addBill(2, "Car loan", TODAY);

    const { byUser } = await collectDue(db(), TODAY);
    expect(byUser.get(1)!.bills.map((b) => b.name)).toEqual(["Rent"]);
    expect(byUser.get(2)!.bills.map((b) => b.name)).toEqual(["Car loan"]);
  });
});

describe("sendDailyDigests", () => {
  it("sends nothing when nothing is due", async () => {
    addUser(1);
    const result = await sendDailyDigests(env(), RUN_AT);
    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("sends when something is due", async () => {
    addUser(1);
    addBill(1, "Rent", TODAY);

    const result = await sendDailyDigests(env(), RUN_AT);
    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("u1@example.com");
    expect(sent[0].text).toContain("Rent");
  });

  it("does not send twice on the same day", async () => {
    addUser(1);
    addBill(1, "Rent", TODAY);

    await sendDailyDigests(env(), RUN_AT);
    // A retried or doubled cron must not mail the same digest again.
    const second = await sendDailyDigests(env(), RUN_AT);

    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("sends again the next day", async () => {
    addUser(1);
    addBill(1, "Rent", TODAY);
    await sendDailyDigests(env(), RUN_AT);

    addBill(1, "Electricity", addDays(TODAY, 1));
    const next = await sendDailyDigests(env(), new Date("2026-08-20T03:15:00Z"));
    expect(next.sent).toBe(1);
    expect(sent).toHaveLength(2);
  });

  it("records the claim before sending, so a mail failure cannot loop", async () => {
    addUser(1);
    addBill(1, "Rent", TODAY);

    await sendDailyDigests(env({ EMAIL: undefined }), RUN_AT);
    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM digest_log").get() as { n: number };
    expect(row.n).toBe(1);
  });

  it("skips the opted-out user and still mails the other", async () => {
    addUser(1, { digest: 0 });
    addUser(2);
    addBill(1, "Rent", TODAY);
    addBill(2, "Rent", TODAY);

    await sendDailyDigests(env(), RUN_AT);
    expect(sent.map((s) => s.to)).toEqual(["u2@example.com"]);
  });
});

describe("renderDigest", () => {
  const items = {
    bills: [{ user_id: 1, name: "Rent", amount: 2_400_000, next_due: "2026-08-18", type: "expense" }],
    tasks: [{ user_id: 1, title: "Call the bank", due_date: TODAY, priority: 1 }],
    budgets: [{ user_id: 1, category: "Food", amount: 10_000, spent: 9_500 }],
  };

  it("leads the subject with what is overdue", () => {
    const mail = renderDigest("Sampath Bandla", items, TODAY, "https://myx.test");
    expect(mail.subject).toContain("1 overdue");
    expect(mail.text).toContain("Morning Sampath.");
  });

  it("carries every section in both parts", () => {
    const mail = renderDigest("Sampath", items, TODAY, "https://myx.test");
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain("Rent");
      expect(part).toContain("Call the bank");
      expect(part).toContain("Food");
    }
    expect(mail.html).toContain("₹24,000");
  });

  it("escapes user text so a note cannot inject markup into the email", () => {
    const nasty = {
      ...items,
      tasks: [{ user_id: 1, title: '<img src=x onerror="alert(1)">', due_date: TODAY, priority: 1 }],
    };
    const mail = renderDigest("Sam", nasty, TODAY, "https://myx.test");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img");
  });
});
