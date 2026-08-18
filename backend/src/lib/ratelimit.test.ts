import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  consumeAttempt,
  peekAttempts,
  resetAttempts,
  pruneExpired,
  clientIp,
  LOGIN_IP_RULE,
} from "./ratelimit";
import { createTestDb, type TestDb } from "../test-support/d1";

const RULE = { limit: 3, windowSeconds: 900 };

let t: TestDb;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => t.db as any;

beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.close());

describe("consumeAttempt", () => {
  it("allows attempts up to the limit and blocks the one after", async () => {
    const now = 1_000_000;
    for (let i = 1; i <= RULE.limit; i++) {
      const r = await consumeAttempt(db(), "k", RULE, now);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(RULE.limit - i);
    }
    const blocked = await consumeAttempt(db(), "k", RULE, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("keeps separate counters per key", async () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i++) await consumeAttempt(db(), "a", RULE, now);
    expect((await consumeAttempt(db(), "a", RULE, now)).allowed).toBe(false);
    expect((await consumeAttempt(db(), "b", RULE, now)).allowed).toBe(true);
  });

  it("starts a fresh budget in the next window", async () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit + 2; i++) await consumeAttempt(db(), "k", RULE, now);
    expect((await consumeAttempt(db(), "k", RULE, now)).allowed).toBe(false);

    const nextWindow = now + RULE.windowSeconds;
    expect((await consumeAttempt(db(), "k", RULE, nextWindow)).allowed).toBe(true);
  });

  it("reports retryAfter as time left in the current window", async () => {
    // 40s into a 900s window -> 860s remain.
    const windowStart = Math.floor(1_000_000 / RULE.windowSeconds) * RULE.windowSeconds;
    const r = await consumeAttempt(db(), "k", RULE, windowStart + 40);
    expect(r.retryAfter).toBe(RULE.windowSeconds - 40);
  });

  it("counts concurrent attempts atomically — no double-spend past the limit", async () => {
    const now = 1_000_000;
    // 10 requests racing on the same key; exactly `limit` may be allowed.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeAttempt(db(), "k", RULE, now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(RULE.limit);
  });
});

describe("peekAttempts", () => {
  it("reads the count without incrementing it", async () => {
    const now = 1_000_000;
    await consumeAttempt(db(), "k", RULE, now);
    expect(await peekAttempts(db(), "k", RULE, now)).toBe(1);
    expect(await peekAttempts(db(), "k", RULE, now)).toBe(1);
  });

  it("returns 0 for a key that was never used", async () => {
    expect(await peekAttempts(db(), "nobody", RULE, 1_000_000)).toBe(0);
  });

  it("sums windows still inside the rule period so a boundary burst can't double up", async () => {
    const windowStart = Math.floor(1_000_000 / RULE.windowSeconds) * RULE.windowSeconds;
    await consumeAttempt(db(), "k", RULE, windowStart + 890); // end of window N
    await consumeAttempt(db(), "k", RULE, windowStart + 910); // start of window N+1
    expect(await peekAttempts(db(), "k", RULE, windowStart + 910)).toBe(2);
  });
});

describe("resetAttempts", () => {
  it("clears the budget so a successful login un-throttles the user", async () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i++) await consumeAttempt(db(), "k", RULE, now);
    expect((await consumeAttempt(db(), "k", RULE, now)).allowed).toBe(false);

    await resetAttempts(db(), "k");
    expect((await consumeAttempt(db(), "k", RULE, now)).allowed).toBe(true);
  });
});

describe("pruneExpired", () => {
  it("drops stale windows and keeps live ones", async () => {
    const now = 10_000_000;
    await consumeAttempt(db(), "old", RULE, now - 60 * 60 * 24);
    await consumeAttempt(db(), "new", RULE, now);

    await pruneExpired(db(), now, RULE.windowSeconds);

    expect(await peekAttempts(db(), "new", RULE, now)).toBe(1);
    const remaining = t.raw.prepare("SELECT COUNT(*) AS n FROM auth_attempts").get() as {
      n: number;
    };
    expect(remaining.n).toBe(1);
  });
});

describe("clientIp", () => {
  const headers = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null });

  it("prefers CF-Connecting-IP, which Cloudflare strips from client input", () => {
    expect(
      clientIp(headers({ "CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "9.9.9.9" })),
    ).toBe("1.1.1.1");
  });

  it("falls back to the first X-Forwarded-For entry", () => {
    expect(clientIp(headers({ "X-Forwarded-For": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
  });

  it("degrades to a constant rather than throwing", () => {
    expect(clientIp(headers({}))).toBe("unknown");
  });
});

describe("production rules", () => {
  it("limits login attempts per IP well below a brute-forceable rate", () => {
    const perHour = (LOGIN_IP_RULE.limit * 3600) / LOGIN_IP_RULE.windowSeconds;
    expect(perHour).toBeLessThanOrEqual(100);
  });
});
