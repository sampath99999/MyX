import { describe, it, expect } from "vitest";
import { advanceDate } from "./recurring";

describe("advanceDate", () => {
  it("advances by days and weeks", () => {
    expect(advanceDate("2026-03-10", "daily", 1)).toBe("2026-03-11");
    expect(advanceDate("2026-03-10", "daily", 21)).toBe("2026-03-31");
    expect(advanceDate("2026-03-10", "weekly", 1)).toBe("2026-03-17");
    expect(advanceDate("2026-03-10", "weekly", 2)).toBe("2026-03-24");
  });

  it("advances by months and years", () => {
    expect(advanceDate("2026-03-10", "monthly", 1)).toBe("2026-04-10");
    expect(advanceDate("2026-03-10", "monthly", 3)).toBe("2026-06-10");
    expect(advanceDate("2026-03-10", "yearly", 1)).toBe("2027-03-10");
  });

  it("clamps to the end of a shorter month instead of overflowing", () => {
    // The classic bug: Jan 31 + 1 month naively becomes Mar 3.
    expect(advanceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(advanceDate("2026-03-31", "monthly", 1)).toBe("2026-04-30");
    expect(advanceDate("2026-05-31", "monthly", 1)).toBe("2026-06-30");
  });

  it("lands on Feb 29 in a leap year and Feb 28 otherwise", () => {
    expect(advanceDate("2028-01-31", "monthly", 1)).toBe("2028-02-29");
    expect(advanceDate("2027-01-31", "monthly", 1)).toBe("2027-02-28");
  });

  it("keeps a Feb 29 bill valid when the next year is not a leap year", () => {
    expect(advanceDate("2028-02-29", "yearly", 1)).toBe("2029-03-01");
  });

  it("rolls the year over correctly", () => {
    expect(advanceDate("2026-12-15", "monthly", 1)).toBe("2027-01-15");
    expect(advanceDate("2026-11-10", "monthly", 14)).toBe("2028-01-10");
    expect(advanceDate("2026-12-31", "daily", 1)).toBe("2027-01-01");
  });

  it("crosses a leap day when counting in days", () => {
    expect(advanceDate("2028-02-28", "daily", 1)).toBe("2028-02-29");
    expect(advanceDate("2027-02-28", "daily", 1)).toBe("2027-03-01");
  });

  it("always returns a well-formed YYYY-MM-DD string", () => {
    const freqs = ["daily", "weekly", "monthly", "yearly"] as const;
    for (const f of freqs) {
      for (let i = 1; i <= 13; i++) {
        expect(advanceDate("2026-01-31", f, i)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("always moves strictly forward in time", () => {
    const freqs = ["daily", "weekly", "monthly", "yearly"] as const;
    for (const f of freqs) {
      for (const start of ["2026-01-31", "2026-02-28", "2026-06-15", "2028-02-29"]) {
        expect(advanceDate(start, f, 1) > start).toBe(true);
      }
    }
  });
});
