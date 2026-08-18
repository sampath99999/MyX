import { describe, it, expect } from "vitest";
import { projectSchedule, monthlyInterest } from "./amortize";

const L = (rupees: number) => Math.round(rupees * 100); // rupees -> paise

describe("monthlyInterest", () => {
  it("computes reducing-balance interest rounded to paise", () => {
    // 10,00,000 at 12% p.a. -> 1% a month -> 10,000
    expect(monthlyInterest(L(1_000_000), 12)).toBe(L(10_000));
  });

  it("returns 0 on a zero balance or zero rate", () => {
    expect(monthlyInterest(0, 9.5)).toBe(0);
    expect(monthlyInterest(L(50_000), 0)).toBe(0);
  });

  it("rounds rather than truncates", () => {
    // 100.00 at 9.9% -> 10000 * 9.9 / 12 / 100 = 82.5 paise -> 83
    expect(monthlyInterest(10_000, 9.9)).toBe(83);
  });
});

describe("projectSchedule", () => {
  it("closes the loan and never leaves a negative balance", () => {
    const r = projectSchedule(L(100_000), 12, L(10_000));
    expect(r.coversInterest).toBe(true);
    expect(r.rows.at(-1)!.balance).toBe(0);
    expect(r.rows.every((row) => row.balance >= 0)).toBe(true);
    expect(r.months).toBe(r.rows.length);
  });

  it("keeps every row internally consistent (payment = interest + principal)", () => {
    const r = projectSchedule(L(250_000), 8.75, L(12_000));
    for (const row of r.rows) {
      expect(row.payment).toBe(row.interest + row.principal);
    }
  });

  it("totals match the sum of the rows exactly", () => {
    const r = projectSchedule(L(500_000), 9.5, L(15_000));
    expect(r.totalInterest).toBe(r.rows.reduce((s, x) => s + x.interest, 0));
    expect(r.totalPaid).toBe(r.rows.reduce((s, x) => s + x.payment, 0));
    // Principal repaid must equal the amount borrowed, to the paise.
    expect(r.rows.reduce((s, x) => s + x.principal, 0)).toBe(L(500_000));
  });

  it("shrinks the final EMI instead of overpaying", () => {
    const r = projectSchedule(L(100_000), 12, L(30_000));
    const last = r.rows.at(-1)!;
    expect(last.payment).toBeLessThan(L(30_000));
    expect(last.balance).toBe(0);
  });

  it("refuses to amortize when the EMI cannot cover the first month's interest", () => {
    // 10,00,000 at 12% needs > 10,000/month just for interest.
    const r = projectSchedule(L(1_000_000), 12, L(9_000));
    expect(r.coversInterest).toBe(false);
    expect(r.rows).toEqual([]);
    expect(r.months).toBe(0);
  });

  it("treats an EMI exactly equal to the interest as non-amortizing", () => {
    const r = projectSchedule(L(1_000_000), 12, L(10_000));
    expect(r.coversInterest).toBe(false);
  });

  it("respects the maxMonths cap instead of looping forever", () => {
    // Covers interest by 1 paise a month: mathematically closes, but only after
    // an absurd number of periods.
    const r = projectSchedule(L(1_000_000), 12, L(10_000) + 1, 24);
    expect(r.months).toBe(24);
    expect(r.rows).toHaveLength(24);
    expect(r.rows.at(-1)!.balance).toBeGreaterThan(0);
  });

  it("handles a zero-interest loan as straight division", () => {
    const r = projectSchedule(L(12_000), 0, L(1_000));
    expect(r.months).toBe(12);
    expect(r.totalInterest).toBe(0);
    expect(r.totalPaid).toBe(L(12_000));
  });

  it("is exact in integer paise for an amount that would drift as a float", () => {
    const r = projectSchedule(L(33_333.33), 7.35, L(3_000));
    expect(Number.isInteger(r.totalInterest)).toBe(true);
    expect(Number.isInteger(r.totalPaid)).toBe(true);
    expect(r.totalPaid).toBe(L(33_333.33) + r.totalInterest);
  });
});
