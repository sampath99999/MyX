/*
  Recurring detection.

  The judgement calls are the whole feature, so they are pinned here rather than
  discovered in production: what counts as the same payee across months, what
  counts as regular, and — most importantly — what does not, because a panel
  that proposes nonsense is worse than one that proposes nothing.
*/

import { describe, it, expect } from "vitest";
import { detectRecurring, signatureOf, type TxnLike } from "./detect";

const TODAY = "2026-08-19";

/** n monthly expenses on the same day, at the same amount unless varied. */
function monthly(
  note: string,
  amount: number,
  months: string[],
  day = "05",
  vary: number[] = [],
): TxnLike[] {
  return months.map((m, i) => ({
    type: "expense" as const,
    amount: amount + (vary[i] ?? 0),
    category: "Bills",
    note,
    occurred_on: `${m}-${day}`,
  }));
}

describe("signatureOf", () => {
  it("sees one payee through the reference numbers and dates a bank adds", () => {
    const a = signatureOf("UPI/NETFLIX/423891/08AUG26", "Subscriptions");
    const b = signatureOf("UPI/NETFLIX/518203/08SEP26", "Subscriptions");
    expect(a).toBe(b);
    expect(a).toContain("netflix");
  });

  it("keeps genuinely different payees apart", () => {
    expect(signatureOf("NETFLIX", "Subs")).not.toBe(signatureOf("SPOTIFY", "Subs"));
  });

  it("falls back to the category when there is no usable description", () => {
    // Otherwise every note-less row collapses into one enormous phantom bill.
    expect(signatureOf(null, "Food")).toBe("category:food");
    expect(signatureOf("  ", "Food")).toBe("category:food");
  });
});

describe("detectRecurring", () => {
  it("finds a monthly bill and proposes the next date", () => {
    const found = detectRecurring(
      monthly("Netflix", 64_900, ["2026-06", "2026-07", "2026-08"]),
      TODAY,
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      name: "Netflix",
      amount: 64_900,
      frequency: "monthly",
      interval: 1,
      occurrences: 3,
      next_due: "2026-09-05",
    });
  });

  it("will not propose anything from two occurrences", () => {
    // Two payments a month apart is a coincidence with a straight line through
    // it. Three is the least that can establish a rhythm.
    expect(detectRecurring(monthly("Gym", 150_000, ["2026-07", "2026-08"]), TODAY)).toHaveLength(0);
  });

  it("ignores amounts that wander, however regular the dates", () => {
    /*
      Groceries every four weeks is a habit, not a bill. Without this the panel
      would offer to set up a "₹4,000 monthly grocery bill" that is never that
      amount twice.
    */
    const found = detectRecurring(
      monthly("Groceries", 400_000, ["2026-06", "2026-07", "2026-08"], "11", [0, 250_000, -180_000]),
      TODAY,
    );
    expect(found).toHaveLength(0);
  });

  it("ignores identical amounts on irregular dates", () => {
    const rows: TxnLike[] = [
      { type: "expense", amount: 50_000, category: "Food", note: "Coffee beans", occurred_on: "2026-06-02" },
      { type: "expense", amount: 50_000, category: "Food", note: "Coffee beans", occurred_on: "2026-06-19" },
      { type: "expense", amount: 50_000, category: "Food", note: "Coffee beans", occurred_on: "2026-08-11" },
    ];
    expect(detectRecurring(rows, TODAY)).toHaveLength(0);
  });

  it("recognises weekly and yearly rhythms too", () => {
    const weekly: TxnLike[] = ["2026-08-01", "2026-08-08", "2026-08-15"].map((d) => ({
      type: "expense",
      amount: 20_000,
      category: "Transport",
      note: "Metro pass",
      occurred_on: d,
    }));
    const yearly: TxnLike[] = ["2024-07-14", "2025-07-13", "2026-07-15"].map((d) => ({
      type: "expense",
      amount: 1_200_000,
      category: "Insurance",
      note: "Car insurance",
      occurred_on: d,
    }));

    expect(detectRecurring(weekly, TODAY)[0]).toMatchObject({ frequency: "weekly", interval: 1 });
    expect(detectRecurring(yearly, TODAY)[0]).toMatchObject({ frequency: "yearly", interval: 1 });
  });

  it("tolerates a bill that slips by a day or two", () => {
    // Direct debits land on working days, so exact 30-day gaps are the
    // exception. Requiring them would find almost nothing real.
    const rows: TxnLike[] = ["2026-06-03", "2026-07-01", "2026-08-04"].map((d) => ({
      type: "expense",
      amount: 99_900,
      category: "Utilities",
      note: "Broadband",
      occurred_on: d,
    }));
    expect(detectRecurring(rows, TODAY)[0]).toMatchObject({ frequency: "monthly" });
  });

  it("never proposes a date that has already passed", () => {
    /*
      A bill last paid in March is overdue, not due in April. Anything else puts
      a next_due in the past on the day it is accepted.
    */
    const stale = detectRecurring(
      monthly("Old bill", 10_000, ["2026-01", "2026-02", "2026-03"]),
      TODAY,
    );
    expect(stale[0].next_due >= TODAY).toBe(true);
  });

  it("ranks the tightest pattern first", () => {
    const clean = monthly("Netflix", 64_900, ["2026-05", "2026-06", "2026-07", "2026-08"], "08");
    const loose = monthly("Water", 30_000, ["2026-06", "2026-07", "2026-08"], "22", [0, 4_000, -3_500]);

    const found = detectRecurring([...loose, ...clean], TODAY);
    expect(found[0].name).toBe("Netflix");
    expect(found[0].confidence).toBeGreaterThan(found[1].confidence);
  });

  it("groups a payee whose narration changes every month", () => {
    const rows: TxnLike[] = [
      "UPI/NETFLIX/423891/05JUN26",
      "UPI/NETFLIX/518203/05JUL26",
      "UPI/NETFLIX/601447/05AUG26",
    ].map((note, i) => ({
      type: "expense" as const,
      amount: 64_900,
      category: "Subscriptions",
      note,
      occurred_on: `2026-0${6 + i}-05`,
    }));

    const found = detectRecurring(rows, TODAY);
    expect(found).toHaveLength(1);
    expect(found[0].occurrences).toBe(3);
  });

  it("keeps income and expense apart even under the same description", () => {
    const rows = [
      ...monthly("Transfer", 500_000, ["2026-06", "2026-07", "2026-08"]),
      ...monthly("Transfer", 500_000, ["2026-06", "2026-07", "2026-08"]).map((t) => ({
        ...t,
        type: "income" as const,
      })),
    ];
    const found = detectRecurring(rows, TODAY);
    expect(found).toHaveLength(2);
    expect(new Set(found.map((f) => f.type))).toEqual(new Set(["income", "expense"]));
  });
});
