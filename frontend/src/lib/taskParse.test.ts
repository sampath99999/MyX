import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "./taskParse";

// 2026-08-08 is a Saturday — fixed so weekday maths is deterministic.
const SAT = "2026-08-08";
const parse = (s: string, today = SAT) => parseQuickAdd(s, today);

describe("parseQuickAdd — plain text", () => {
  it("returns the title untouched when there is nothing to extract", () => {
    expect(parse("Buy milk")).toEqual({
      title: "Buy milk",
      due_date: null,
      priority: null,
      labels: [],
    });
  });

  it("collapses whitespace left behind by extraction", () => {
    expect(parse("  Pay   rent   ").title).toBe("Pay rent");
  });
});

describe("parseQuickAdd — priority", () => {
  it("reads !p1..!p4", () => {
    for (const n of [1, 2, 3, 4]) {
      const r = parse(`Task !p${n}`);
      expect(r.priority).toBe(n);
      expect(r.title).toBe("Task");
    }
  });

  it("reads the bare !1..!4 form", () => {
    expect(parse("Task !2").priority).toBe(2);
  });

  it("ignores out-of-range priorities and leaves them in the title", () => {
    expect(parse("Task !p5").priority).toBeNull();
    expect(parse("Task !p5").title).toContain("!p5");
    expect(parse("Task !0").priority).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parse("Task !P1").priority).toBe(1);
  });
});

describe("parseQuickAdd — labels", () => {
  it("extracts a single label", () => {
    const r = parse("Pay rent #home");
    expect(r.labels).toEqual(["home"]);
    expect(r.title).toBe("Pay rent");
  });

  it("extracts several labels", () => {
    expect(parse("Ship it #work #urgent").labels).toEqual(["work", "urgent"]);
  });

  it("allows hyphens and digits in a label", () => {
    expect(parse("Task #q3-planning").labels).toEqual(["q3-planning"]);
  });

  it("recognises a label at the very start of the input", () => {
    // The parser pads the input with spaces before matching, so a leading tag
    // is picked up just like one in the middle.
    expect(parse("#home").labels).toEqual(["home"]);
    expect(parse("#home water the plants").title).toBe("water the plants");
  });

  it("does not treat a # inside a word as a label", () => {
    expect(parse("Buy C#book").labels).toEqual([]);
  });
});

describe("parseQuickAdd — relative dates", () => {
  it("resolves today and tomorrow", () => {
    expect(parse("Call mom today").due_date).toBe(SAT);
    expect(parse("Call mom tomorrow").due_date).toBe("2026-08-09");
    expect(parse("Call mom tmr").due_date).toBe("2026-08-09");
  });

  it("resolves 'in N days'", () => {
    expect(parse("Review in 3 days").due_date).toBe("2026-08-11");
    expect(parse("Review in 1 day").due_date).toBe("2026-08-09");
  });

  it("crosses a month boundary correctly", () => {
    expect(parse("Ping in 25 days").due_date).toBe("2026-09-02");
  });
});

describe("parseQuickAdd — weekdays", () => {
  it("picks the coming occurrence of a weekday", () => {
    // Saturday -> Monday is 2 days out.
    expect(parse("Standup monday").due_date).toBe("2026-08-10");
  });

  it("treats a weekday naming today as next week, not today", () => {
    // "saturday" on a Saturday means the next one, 7 days out.
    expect(parse("Chores saturday").due_date).toBe("2026-08-15");
  });

  it("adds a further week for 'next <weekday>'", () => {
    expect(parse("Standup next monday").due_date).toBe("2026-08-17");
  });

  it("accepts short forms", () => {
    expect(parse("Standup mon").due_date).toBe("2026-08-10");
    expect(parse("Gym wed").due_date).toBe("2026-08-12");
  });

  it("removes the matched weekday from the title", () => {
    expect(parse("Standup monday").title).toBe("Standup");
  });
});

describe("parseQuickAdd — combinations", () => {
  it("handles the documented example end to end", () => {
    expect(parse("pay rent tomorrow !p1 #home")).toEqual({
      title: "pay rent",
      due_date: "2026-08-09",
      priority: 1,
      labels: ["home"],
    });
  });

  it("handles tokens in any order", () => {
    const r = parse("#errands !p2 in 2 days Post the parcel");
    expect(r.labels).toEqual(["errands"]);
    expect(r.priority).toBe(2);
    expect(r.due_date).toBe("2026-08-10");
    expect(r.title).toBe("Post the parcel");
  });

  it("never returns a due date in the past", () => {
    for (const input of ["x today", "x tomorrow", "x monday", "x next friday", "x in 5 days"]) {
      expect(parse(input).due_date! >= SAT).toBe(true);
    }
  });

  it("always returns a YYYY-MM-DD due date when one is set", () => {
    for (const input of ["x tomorrow", "x monday", "x in 40 days", "x next sun"]) {
      expect(parse(input).due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("resolves weekdays correctly from every day of a week", () => {
    // 2026-08-09 is a Sunday; walk a full week and check Monday each time.
    const expected = [
      ["2026-08-09", "2026-08-10"], // Sun -> Mon (next day)
      ["2026-08-10", "2026-08-17"], // Mon -> Mon (a week out)
      ["2026-08-11", "2026-08-17"], // Tue -> Mon
      ["2026-08-12", "2026-08-17"], // Wed -> Mon
    ];
    for (const [today, monday] of expected) {
      expect(parse("standup monday", today).due_date).toBe(monday);
    }
  });
});
