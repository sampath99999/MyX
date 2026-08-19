/*
  EMI maths.

  The published numbers have to match what a bank would quote, so the anchors
  here are worked examples rather than snapshots of our own output — a test that
  only agrees with itself would happily lock in a wrong formula.
*/

import { describe, it, expect } from "vitest";
import {
  computeEmi,
  buildSchedule,
  calculateLoan,
  monthlyInterest,
  formatRupees,
  formatTenure,
} from "./emi";

describe("computeEmi", () => {
  it("matches the standard annuity result for a textbook home loan", () => {
    // ₹22,00,000 at 9.9% over 20 years. The annuity formula gives ₹21,084.92,
    // quoted up to the whole rupee the way a sanction letter does.
    expect(computeEmi(22_00_000_00, 9.9, 240)).toBe(21_085_00);
  });

  it("matches a short car loan", () => {
    // ₹8,00,000 at 9% over 5 years → ₹16,607.
    expect(computeEmi(8_00_000_00, 9, 60)).toBe(16_607_00);
  });

  it("splits the principal evenly at zero interest", () => {
    // The formula divides by zero here, so this path is handled separately.
    expect(computeEmi(1_20_000_00, 0, 12)).toBe(10_000_00);
  });

  it("returns 0 rather than NaN for nonsense input", () => {
    expect(computeEmi(0, 9, 240)).toBe(0);
    expect(computeEmi(1_00_000_00, 9, 0)).toBe(0);
    expect(computeEmi(1_00_000_00, -1, 12)).toBe(0);
  });
});

describe("buildSchedule", () => {
  it("clears the balance to exactly zero", () => {
    const { schedule } = calculateLoan(2_200_000, 9.9, 240);
    expect(schedule.at(-1)!.balance).toBe(0);
  });

  it("clears within the stated tenure, never past it", () => {
    /*
      Rounding the instalment to the paise left ~₹5 outstanding after month 240
      and produced a 241st row — the reason computeEmi quotes whole rupees.
      Overrunning the tenure is the failure that matters here.
    */
    for (const [principal, rate, months] of [
      [2_200_000, 9.9, 240],
      [800_000, 9, 60],
      [50_000, 14, 12],
      [10_000_000, 8.5, 360],
    ] as const) {
      const result = calculateLoan(principal, rate, months);
      expect(result.months).toBeLessThanOrEqual(months);
      expect(result.months).toBeGreaterThanOrEqual(months - 1);
    }
  });

  it("charges interest on the reducing balance, not the original principal", () => {
    const { schedule } = calculateLoan(2_200_000, 9.9, 240);
    // Interest falls every month as the balance does — the whole point of
    // reducing balance, and the thing flat-rate calculators get wrong.
    expect(schedule[1].interest).toBeLessThan(schedule[0].interest);
    expect(schedule.at(-1)!.interest).toBeLessThan(schedule[0].interest / 10);
  });

  it("puts more into interest than principal early on a long loan", () => {
    const { schedule } = calculateLoan(2_200_000, 9.9, 240);
    expect(schedule[0].interest).toBeGreaterThan(schedule[0].principal);
    expect(schedule.at(-1)!.principal).toBeGreaterThan(schedule.at(-1)!.interest);
  });

  it("keeps principal + interest equal to the total payable", () => {
    const r = calculateLoan(2_200_000, 9.9, 240);
    const paidPrincipal = r.schedule.reduce((sum, row) => sum + row.principal, 0);
    expect(paidPrincipal).toBe(2_200_000 * 100);
    expect(r.totalPayable).toBe(2_200_000 * 100 + r.totalInterest);
  });

  it("reports nothing when the EMI cannot cover the first month's interest", () => {
    // Otherwise the balance grows forever and the loop would run to its cap.
    const result = buildSchedule(10_00_000_00, 12, 1_000_00);
    expect(result.months).toBe(0);
    expect(result.schedule).toHaveLength(0);
  });

  it("agrees with monthlyInterest on the first row", () => {
    const principal = 10_00_000_00;
    const r = calculateLoan(principal / 100, 9, 60);
    expect(r.schedule[0].interest).toBe(monthlyInterest(principal, 9));
  });
});

describe("formatting", () => {
  it("groups rupees the Indian way", () => {
    expect(formatRupees(22_00_000_00)).toBe("₹22,00,000");
    expect(formatRupees(2_10_88_00)).toBe("₹21,088");
  });

  it("says tenures the way people do", () => {
    expect(formatTenure(240)).toBe("20y");
    expect(formatTenure(38)).toBe("3y 2m");
    expect(formatTenure(7)).toBe("7m");
  });
});
