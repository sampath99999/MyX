/*
  Email verification by one-time code.

  A 6-digit code is weak on its own — a million possibilities is nothing to a
  script. What makes it safe is the policy around it, so that is what these
  tests pin down: the attempt cap actually bites, a resend replaces rather than
  adds, expiry is enforced, and the stored value is a digest.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import authRoutes from "./auth";
import { createTestDb, type TestDb } from "../test-support/d1";
import { generateOtp, isWellFormedOtp, normalizeOtp, OTP_MAX_ATTEMPTS } from "../lib/otp";
import type { AppBindings } from "../types";

let t: TestDb;
let sent: { to: string; subject: string; text: string }[];

function makeApp(extraEnv: Partial<AppBindings["Bindings"]> = {}) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/auth", authRoutes);

  const env = {
    DB: t.db,
    JWT_SECRET: "test-secret",
    APP_NAME: "MyX",
    REGISTRATION_OPEN: "true",
    EMAIL: {
      send: async (m: { to: string; subject: string; text: string }) => {
        sent.push({ to: m.to, subject: m.subject, text: m.text });
      },
    },
    ...extraEnv,
  };

  return (path: string, body: unknown, token?: string, method = "POST") =>
    app.request(
      path,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      },
      env,
    );
}

const NEW_USER = { email: "new@example.com", name: "New", password: "correct horse battery" };

/** The code as the user reads it out of the email. */
const codeFromEmail = () => sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];

async function signUp(request = makeApp()) {
  const res = await request("/api/auth/register", NEW_USER);
  const body = (await res.json()) as { token: string; user: { email_verified: boolean } };
  return body;
}

beforeEach(() => {
  t = createTestDb();
  sent = [];
});
afterEach(() => {
  t.close();
  vi.useRealTimers();
});

describe("generateOtp", () => {
  it("always produces six digits, zero-padded", () => {
    for (let i = 0; i < 300; i++) expect(isWellFormedOtp(generateOtp())).toBe(true);
  });

  it("does not collapse to a handful of values", () => {
    const seen = new Set(Array.from({ length: 300 }, () => generateOtp()));
    expect(seen.size).toBeGreaterThan(250);
  });
});

describe("normalizeOtp", () => {
  it("accepts the formats people actually paste", () => {
    expect(normalizeOtp("123 456")).toBe("123456");
    expect(normalizeOtp("123-456")).toBe("123456");
    expect(normalizeOtp(" 123456 ")).toBe("123456");
  });
});

describe("signup", () => {
  it("emails a code and reports the account unverified", async () => {
    const body = await signUp();
    expect(body.user.email_verified).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(NEW_USER.email);
    expect(isWellFormedOtp(codeFromEmail())).toBe(true);
  });

  it("still creates a usable account when the mail transport is missing", async () => {
    // A broken mail path must not become a broken signup.
    const res = await makeApp({ EMAIL: undefined })("/api/auth/register", NEW_USER);
    expect(res.status).toBe(201);
    expect((await res.json()) as { token: string }).toHaveProperty("token");
  });

  it("stores a digest of the code, not the code", async () => {
    await signUp();
    const code = codeFromEmail();
    const row = t.raw.prepare("SELECT code_hash FROM email_otps").get() as { code_hash: string };
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.code_hash).not.toContain(code);
  });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies with the right code and clears the pending row", async () => {
    const request = makeApp();
    const { token } = await signUp(request);

    const res = await request("/api/auth/verify-email", { code: codeFromEmail() }, token);
    expect(res.status).toBe(200);

    const user = t.raw.prepare("SELECT email_verified AS v FROM users").get() as { v: number };
    expect(user.v).toBe(1);
    const left = t.raw.prepare("SELECT COUNT(*) AS n FROM email_otps").get() as { n: number };
    expect(left.n).toBe(0);
  });

  it("rejects a wrong code", async () => {
    const request = makeApp();
    const { token } = await signUp(request);
    const wrong = codeFromEmail() === "000000" ? "111111" : "000000";

    const res = await request("/api/auth/verify-email", { code: wrong }, token);
    expect(res.status).toBe(400);
    const user = t.raw.prepare("SELECT email_verified AS v FROM users").get() as { v: number };
    expect(user.v).toBe(0);
  });

  it("stops accepting guesses after the cap, even the correct one", async () => {
    const request = makeApp();
    const { token } = await signUp(request);
    const code = codeFromEmail();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await request("/api/auth/verify-email", { code: wrong }, token);
    }

    // The budget is spent, so the real code no longer helps — this is what makes
    // six digits defensible.
    const res = await request("/api/auth/verify-email", { code }, token);
    expect(res.status).toBe(400);
    const user = t.raw.prepare("SELECT email_verified AS v FROM users").get() as { v: number };
    expect(user.v).toBe(0);
  });

  it("rejects an expired code", async () => {
    const request = makeApp();
    const { token } = await signUp(request);
    const code = codeFromEmail();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000)); // TTL is 15 minutes

    const res = await request("/api/auth/verify-email", { code }, token);
    expect(res.status).toBe(400);
  });

  it("rejects malformed input without touching the attempt budget", async () => {
    const request = makeApp();
    const { token } = await signUp(request);

    await request("/api/auth/verify-email", { code: "abc" }, token);
    const row = t.raw.prepare("SELECT attempts FROM email_otps").get() as { attempts: number };
    expect(row.attempts).toBe(0);
  });

  it("requires a session", async () => {
    await signUp();
    const res = await makeApp()("/api/auth/verify-email", { code: codeFromEmail() });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/verify-email/resend", () => {
  it("replaces the old code rather than leaving both live", async () => {
    const request = makeApp();
    const { token } = await signUp(request);
    const first = codeFromEmail();

    await request("/api/auth/verify-email/resend", {}, token);
    const second = codeFromEmail();
    expect(second).not.toBe(first);

    // Only one code may be outstanding, or a resend multiplies the odds.
    const rows = t.raw.prepare("SELECT COUNT(*) AS n FROM email_otps").get() as { n: number };
    expect(rows.n).toBe(1);

    expect((await request("/api/auth/verify-email", { code: first }, token)).status).toBe(400);
    expect((await request("/api/auth/verify-email", { code: second }, token)).status).toBe(200);
  });

  it("resets the attempt budget with the new code", async () => {
    const request = makeApp();
    const { token } = await signUp(request);
    const wrong = codeFromEmail() === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await request("/api/auth/verify-email", { code: wrong }, token);
    }

    await request("/api/auth/verify-email/resend", {}, token);
    const res = await request("/api/auth/verify-email", { code: codeFromEmail() }, token);
    expect(res.status).toBe(200);
  });

  it("is a no-op once verified, and sends no further email", async () => {
    const request = makeApp();
    const { token } = await signUp(request);
    await request("/api/auth/verify-email", { code: codeFromEmail() }, token);

    const before = sent.length;
    const res = await request("/api/auth/verify-email/resend", {}, token);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(before);
  });
});

describe("REQUIRE_VERIFIED_EMAIL", () => {
  it("lets an unverified account sign in while the gate is off", async () => {
    const request = makeApp();
    await signUp(request);
    const res = await request("/api/auth/login", {
      email: NEW_USER.email,
      password: NEW_USER.password,
    });
    expect(res.status).toBe(200);
  });

  it("still lets an unverified account sign in when the gate is on", async () => {
    /*
      The gate must not block the door. Entering a code needs a session, so a
      rejected login would leave the account permanently unverifiable — the
      trap this test exists to prevent from coming back.
    */
    await signUp(makeApp());
    const gated = makeApp({ REQUIRE_VERIFIED_EMAIL: "true" });
    const res = await gated("/api/auth/login", {
      email: NEW_USER.email,
      password: NEW_USER.password,
    });
    expect(res.status).toBe(200);
  });

  it("keeps /api/auth reachable so the code can still be entered", async () => {
    const gated = makeApp({ REQUIRE_VERIFIED_EMAIL: "true" });
    const { token } = await signUp(gated);

    expect((await gated("/api/auth/verify-email/resend", {}, token)).status).toBe(200);
    const verified = await gated("/api/auth/verify-email", { code: codeFromEmail() }, token);
    expect(verified.status).toBe(200);
  });
});
