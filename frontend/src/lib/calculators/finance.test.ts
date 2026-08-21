import { describe, it, expect } from "vitest";
import {
  sip,
  stepUpSip,
  lumpsum,
  swp,
  fd,
  rd,
  ppf,
  compoundInterest,
  simpleInterest,
  cagr,
  gst,
  inflation,
} from "./finance";

/*
  These check the numbers against the conventions the functions claim to follow,
  not against themselves. Where a published figure exists for a standard case
  (a ₹10,000 SIP at 12% for 10 years is quoted everywhere as ≈ ₹23.2 lakh) the
  test asserts that, because "it returns what it returned last time" is a test
  that cannot catch a wrong formula.
*/

const near = (actual: number, expected: number, tolerance: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

describe("sip", () => {
  it("matches the standard published figure for 10k at 12% over 10 years", () => {
    const r = sip(10_000, 12, 10);
    expect(r.invested).toBe(12_00_000);
    // Start-of-month annuity: ≈ ₹23.23 lakh.
    near(r.value, 23_23_391, 2000);
    near(r.returns, r.value - r.invested, 1);
  });

  it("invests at the start of the month, so it beats the end-of-month figure", () => {
    const startOfMonth = sip(10_000, 12, 10).value;
    // End-of-month would be the same divided by (1 + i).
    const endOfMonth = startOfMonth / (1 + 0.12 / 12);
    expect(startOfMonth).toBeGreaterThan(endOfMonth);
  });

  it("returns zero growth at a zero rate, and still counts what went in", () => {
    const r = sip(5_000, 0, 3);
    expect(r.invested).toBe(1_80_000);
    near(r.value, 1_80_000, 1);
    near(r.returns, 0, 1);
  });

  it("reports one series point per completed year", () => {
    expect(sip(1_000, 10, 5).series).toHaveLength(5);
  });

  it("handles a zero term without producing NaN", () => {
    const r = sip(1_000, 12, 0);
    expect(r.value).toBe(0);
    expect(Number.isNaN(r.value)).toBe(false);
  });
});

describe("stepUpSip", () => {
  it("with a 0% step-up is identical to a plain SIP", () => {
    const plain = sip(10_000, 12, 10);
    const stepped = stepUpSip(10_000, 12, 10, 0);
    near(stepped.value, plain.value, 1);
    near(stepped.invested, plain.invested, 1);
  });

  it("invests and returns more as the step-up rises", () => {
    const a = stepUpSip(10_000, 12, 10, 0);
    const b = stepUpSip(10_000, 12, 10, 10);
    expect(b.invested).toBeGreaterThan(a.invested);
    expect(b.value).toBeGreaterThan(a.value);
  });

  it("raises the instalment on the anniversary, not during the first year", () => {
    // 12 months at 10k with no growth = 1.2L regardless of the step-up.
    const r = stepUpSip(10_000, 0, 1, 25);
    near(r.invested, 1_20_000, 1);
  });
});

describe("lumpsum", () => {
  it("compounds annually", () => {
    const r = lumpsum(1_00_000, 10, 3);
    near(r.value, 1_33_100, 1); // 100000 × 1.1³
    near(r.returns, 33_100, 1);
  });
});

describe("swp", () => {
  it("leaves the corpus growing when withdrawals are smaller than the growth", () => {
    // 1% a month growth on 10L is ~10k; withdrawing 5k must leave it rising.
    const r = swp(10_00_000, 5_000, 12, 5);
    expect(r.finalBalance).toBeGreaterThan(10_00_000);
    expect(r.exhaustedInMonth).toBeNull();
  });

  it("reports the month the corpus runs dry", () => {
    const r = swp(1_00_000, 50_000, 0, 5);
    expect(r.exhaustedInMonth).toBe(2);
    expect(r.finalBalance).toBe(0);
  });

  it("never withdraws more than is left", () => {
    const r = swp(30_000, 50_000, 0, 2);
    near(r.totalWithdrawn, 30_000, 1);
  });
});

describe("fd", () => {
  it("compounds quarterly by default, as Indian banks do", () => {
    const r = fd(1_00_000, 7, 5);
    // 100000 × (1 + 0.07/4)^20 ≈ 141,478
    near(r.value, 1_41_478, 50);
  });

  it("compounds harder the more often it is compounded", () => {
    const annual = fd(1_00_000, 7, 5, 1).value;
    const quarterly = fd(1_00_000, 7, 5, 4).value;
    const monthly = fd(1_00_000, 7, 5, 12).value;
    expect(quarterly).toBeGreaterThan(annual);
    expect(monthly).toBeGreaterThan(quarterly);
  });
});

describe("rd", () => {
  it("returns more than the sum of the instalments", () => {
    const r = rd(5_000, 7, 5);
    expect(r.invested).toBe(3_00_000);
    expect(r.value).toBeGreaterThan(r.invested);
    // A 5-year RD at 7% lands near 3.58L.
    near(r.value, 3_58_000, 6_000);
  });

  it("earns nothing at a zero rate", () => {
    const r = rd(1_000, 0, 2);
    near(r.value, r.invested, 1);
  });
});

describe("ppf", () => {
  it("matches the 15-year maximum-contribution case", () => {
    // 1.5L a year for 15 years at 7.1% is the standard worked example, ≈ 40.68L.
    const r = ppf(1_50_000, 7.1, 15);
    expect(r.invested).toBe(22_50_000);
    near(r.value, 40_68_209, 20_000);
  });
});

describe("compoundInterest", () => {
  it("is the FD engine with a caller-chosen frequency", () => {
    near(compoundInterest(1_00_000, 10, 2, 1).value, 1_21_000, 1);
  });
});

describe("simpleInterest", () => {
  it("does not compound", () => {
    const r = simpleInterest(1_00_000, 10, 3);
    expect(r.interest).toBe(30_000);
    expect(r.total).toBe(1_30_000);
  });

  it("is always less than the compound equivalent over more than a year", () => {
    expect(simpleInterest(1_00_000, 10, 5).total).toBeLessThan(
      compoundInterest(1_00_000, 10, 5, 1).value,
    );
  });
});

describe("cagr", () => {
  it("computes the annualised rate", () => {
    near(cagr(1_00_000, 2_00_000, 5)!, 14.87, 0.02);
  });

  it("is negative when the value fell", () => {
    expect(cagr(2_00_000, 1_00_000, 5)!).toBeLessThan(0);
  });

  it("refuses meaningless inputs rather than returning Infinity", () => {
    expect(cagr(0, 1_00_000, 5)).toBeNull();
    expect(cagr(1_00_000, 2_00_000, 0)).toBeNull();
  });
});

describe("gst", () => {
  it("adds tax on top in exclusive mode", () => {
    const r = gst(1_000, 18, "exclusive");
    expect(r.base).toBe(1_000);
    expect(r.gst).toBe(180);
    expect(r.total).toBe(1_180);
  });

  it("strips tax out in inclusive mode", () => {
    const r = gst(1_180, 18, "inclusive");
    near(r.base, 1_000, 0.01);
    near(r.gst, 180, 0.01);
    near(r.total, 1_180, 0.01);
  });

  it("splits the tax evenly into CGST and SGST", () => {
    const r = gst(1_000, 18, "exclusive");
    expect(r.cgst).toBe(90);
    expect(r.sgst).toBe(90);
  });

  it("round-trips: adding then stripping returns the original", () => {
    const added = gst(2_500, 12, "exclusive");
    const stripped = gst(added.total, 12, "inclusive");
    near(stripped.base, 2_500, 0.01);
  });
});

describe("inflation", () => {
  it("raises the cost and erodes the money by the same factor", () => {
    const r = inflation(1_00_000, 6, 10);
    near(r.futureCost, 1_79_085, 50);
    near(r.futureValueOfToday, 55_839, 50);
    near(r.erosion, 1_00_000 - r.futureValueOfToday, 1);
  });
});
