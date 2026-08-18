// Verifies the schema-level guarantee behind BUG-03: the UNIQUE index is what
// actually stops a double-tap booking two EMIs. The route's SELECT-then-INSERT
// is only an optimisation — under a race both requests get past the SELECT, so
// the database has to be the one that says no.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../test-support/d1";

let t: TestDb;

const insertPayment = (loanId: number, key: string | null, amount = 1000) =>
  t.raw
    .prepare(
      `INSERT INTO loan_payments
         (loan_id, user_id, amount, interest_part, principal_part, balance_after, paid_on, idempotency_key)
       VALUES (?, 1, ?, 0, ?, 0, '2026-08-08', ?)`,
    )
    .run(loanId, amount, amount, key);

beforeEach(() => {
  t = createTestDb();
  t.raw
    .prepare("INSERT INTO users (id, email, name, password_hash) VALUES (1, 'a@b.co', 'A', 'x')")
    .run();
  t.raw
    .prepare(
      `INSERT INTO loans (id, user_id, name, principal, annual_rate, emi, outstanding, start_date)
       VALUES (1, 1, 'Home', 100000, 9, 5000, 100000, '2026-01-01'),
              (2, 1, 'Car',  100000, 9, 5000, 100000, '2026-01-01')`,
    )
    .run();
});
afterEach(() => t.close());

describe("loan payment idempotency", () => {
  it("accepts the first payment for a key", () => {
    expect(() => insertPayment(1, "key-a")).not.toThrow();
  });

  it("rejects a replay of the same key on the same loan", () => {
    insertPayment(1, "key-a");
    expect(() => insertPayment(1, "key-a")).toThrow(/UNIQUE/i);
  });

  it("still allows a genuine second EMI under a new key", () => {
    insertPayment(1, "key-a");
    expect(() => insertPayment(1, "key-b")).not.toThrow();

    const n = t.raw.prepare("SELECT COUNT(*) AS n FROM loan_payments").get() as { n: number };
    expect(n.n).toBe(2);
  });

  it("scopes keys per loan, so paying two loans in one session works", () => {
    insertPayment(1, "same-key");
    expect(() => insertPayment(2, "same-key")).not.toThrow();
  });

  it("leaves pre-existing NULL-key rows alone", () => {
    // Historical payments migrated in without a key must not collide with each
    // other — SQLite treats NULLs as distinct in a UNIQUE index.
    insertPayment(1, null);
    expect(() => insertPayment(1, null)).not.toThrow();

    const n = t.raw.prepare("SELECT COUNT(*) AS n FROM loan_payments").get() as { n: number };
    expect(n.n).toBe(2);
  });

  it("rolls the whole batch back when the duplicate insert fails", async () => {
    // Mirrors the route: payment + loan update + expense transaction in one
    // batch. If the payment is a replay, none of it may be applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = t.db as any;
    insertPayment(1, "key-a", 5000);

    const before = t.raw.prepare("SELECT outstanding FROM loans WHERE id = 1").get() as {
      outstanding: number;
    };

    await expect(
      db.batch([
        db
          .prepare(
            `INSERT INTO loan_payments
               (loan_id, user_id, amount, interest_part, principal_part, balance_after, paid_on, idempotency_key)
             VALUES (1, 1, 5000, 0, 5000, 95000, '2026-08-08', 'key-a')`,
          )
          .bind(),
        db.prepare("UPDATE loans SET outstanding = 95000 WHERE id = 1").bind(),
        db
          .prepare(
            `INSERT INTO transactions (user_id, type, amount, category, note, occurred_on)
             VALUES (1, 'expense', 5000, 'Loan EMI', 'Home EMI', '2026-08-08')`,
          )
          .bind(),
      ]),
    ).rejects.toThrow();

    const after = t.raw.prepare("SELECT outstanding FROM loans WHERE id = 1").get() as {
      outstanding: number;
    };
    const tx = t.raw.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };

    expect(after.outstanding).toBe(before.outstanding);
    expect(tx.n).toBe(0); // no phantom expense from the rolled-back batch
  });
});

describe("token revocation column", () => {
  it("defaults to 0 so existing sessions keep working after the migration", () => {
    const row = t.raw.prepare("SELECT token_version FROM users WHERE id = 1").get() as {
      token_version: number;
    };
    expect(row.token_version).toBe(0);
  });

  it("increments to strand previously issued tokens", () => {
    t.raw.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = 1").run();
    const row = t.raw.prepare("SELECT token_version FROM users WHERE id = 1").get() as {
      token_version: number;
    };
    expect(row.token_version).toBe(1);
  });
});
