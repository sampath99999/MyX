/*
  Password reset and account deletion, through the real Hono app against real
  SQLite. The properties worth pinning down are the security ones: a reset link
  works once, expires, cannot be guessed from the response, and cannot be used
  to enumerate accounts.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import authRoutes from "./auth";
import { createTestDb, type TestDb } from "../test-support/d1";
import { hashPassword } from "../lib/auth";
import type { AppBindings } from "../types";

let t: TestDb;
let sent: { to: string; text: string }[];

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
    APP_URL: "https://example.test",
    EMAIL: {
      send: async (m: { to: string; text: string }) => {
        sent.push({ to: m.to, text: m.text });
      },
    },
    ...extraEnv,
  };

  return (path: string, body: unknown, init: RequestInit = {}) =>
    app.request(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...init,
      },
      env,
    );
}

/** Pull the token out of the email we captured, the way a user clicks the link. */
const tokenFromEmail = () => sent.at(-1)!.text.match(/token=([\w-]+)/)![1];

beforeEach(async () => {
  t = createTestDb();
  sent = [];
  t.raw
    .prepare("INSERT INTO users (id, email, name, password_hash) VALUES (1, 'a@b.co', 'A', ?)")
    .run(await hashPassword("original-password"));
});
afterEach(() => {
  t.close();
  vi.useRealTimers();
});

describe("POST /api/auth/forgot", () => {
  it("emails a link for a real address", async () => {
    const res = await makeApp()("/api/auth/forgot", { email: "a@b.co" });
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("a@b.co");
    expect(sent[0].text).toContain("https://example.test/reset?token=");
  });

  it("answers identically for an unknown address, and sends nothing", async () => {
    const known = await makeApp()("/api/auth/forgot", { email: "a@b.co" });
    const unknown = await makeApp()("/api/auth/forgot", { email: "nobody@b.co" });

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    // One email total — the second request found no account.
    expect(sent).toHaveLength(1);
  });

  it("never puts the token in the response body", async () => {
    const res = await makeApp()("/api/auth/forgot", { email: "a@b.co" });
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain(tokenFromEmail());
  });

  it("stores only a hash of the token, never the token itself", async () => {
    await makeApp()("/api/auth/forgot", { email: "a@b.co" });
    const token = tokenFromEmail();

    const rows = t.raw.prepare("SELECT token_hash FROM password_resets").all() as {
      token_hash: string;
    }[];
    expect(rows).toHaveLength(1);
    // A 64-char hex digest, and emphatically not the emailed value: someone who
    // reads this table cannot reset anyone's password.
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].token_hash).not.toBe(token);
  });

  it("still answers 202 when the mail transport is unconfigured", async () => {
    const res = await makeApp({ EMAIL: undefined })("/api/auth/forgot", { email: "a@b.co" });
    expect(res.status).toBe(202);
  });
});

describe("POST /api/auth/reset", () => {
  it("sets the new password and lets it sign in", async () => {
    const request = makeApp();
    await request("/api/auth/forgot", { email: "a@b.co" });

    const res = await request("/api/auth/reset", {
      token: tokenFromEmail(),
      password: "a-brand-new-password",
    });
    expect(res.status).toBe(200);

    const ok = await request("/api/auth/login", {
      email: "a@b.co",
      password: "a-brand-new-password",
    });
    expect(ok.status).toBe(200);
  });

  it("invalidates the old password", async () => {
    const request = makeApp();
    await request("/api/auth/forgot", { email: "a@b.co" });
    await request("/api/auth/reset", { token: tokenFromEmail(), password: "a-brand-new-password" });

    const res = await request("/api/auth/login", { email: "a@b.co", password: "original-password" });
    expect(res.status).toBe(401);
  });

  it("revokes existing sessions by bumping token_version", async () => {
    const before = t.raw.prepare("SELECT token_version AS v FROM users WHERE id = 1").get() as {
      v: number;
    };
    const request = makeApp();
    await request("/api/auth/forgot", { email: "a@b.co" });
    await request("/api/auth/reset", { token: tokenFromEmail(), password: "a-brand-new-password" });

    const after = t.raw.prepare("SELECT token_version AS v FROM users WHERE id = 1").get() as {
      v: number;
    };
    expect(after.v).toBeGreaterThan(before.v);
  });

  it("refuses a second use of the same link", async () => {
    const request = makeApp();
    await request("/api/auth/forgot", { email: "a@b.co" });
    const token = tokenFromEmail();

    expect((await request("/api/auth/reset", { token, password: "first-new-password" })).status).toBe(200);
    const replay = await request("/api/auth/reset", { token, password: "second-new-password" });
    expect(replay.status).toBe(400);
  });

  it("refuses an expired link", async () => {
    const request = makeApp();
    await request("/api/auth/forgot", { email: "a@b.co" });
    const token = tokenFromEmail();

    // 31 minutes later — the link lives for 30.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 31 * 60 * 1000));

    const res = await request("/api/auth/reset", { token, password: "a-brand-new-password" });
    expect(res.status).toBe(400);
  });

  it("refuses a made-up token", async () => {
    const res = await makeApp()("/api/auth/reset", {
      token: "not-a-real-token",
      password: "a-brand-new-password",
    });
    expect(res.status).toBe(400);
  });

  it("enforces the minimum password length", async () => {
    const request = makeApp();
    await request("/api/auth/forgot", { email: "a@b.co" });
    const res = await request("/api/auth/reset", { token: tokenFromEmail(), password: "short" });
    expect(res.status).toBe(400);
  });

  it("retires every other outstanding link for the account", async () => {
    const request = makeApp();
    await request("/api/auth/forgot", { email: "a@b.co" });
    const first = tokenFromEmail();
    await request("/api/auth/forgot", { email: "a@b.co" });
    const second = tokenFromEmail();

    expect((await request("/api/auth/reset", { token: second, password: "chosen-password" })).status).toBe(200);
    const stale = await request("/api/auth/reset", { token: first, password: "another-password" });
    expect(stale.status).toBe(400);
  });
});

describe("DELETE /api/auth/account", () => {
  async function signIn() {
    const res = await makeApp()("/api/auth/login", {
      email: "a@b.co",
      password: "original-password",
    });
    return ((await res.json()) as { token: string }).token;
  }

  const del = (token: string, password: string) =>
    makeApp()(
      "/api/auth/account",
      { password },
      { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
    );

  it("deletes the account when the password is right", async () => {
    const res = await del(await signIn(), "original-password");
    expect(res.status).toBe(200);
    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("refuses without the correct password, so a stolen token is not enough", async () => {
    const res = await del(await signIn(), "not-the-password");
    expect(res.status).toBe(403);
    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    expect(row.n).toBe(1);
  });

  it("cascades to the user's data", async () => {
    t.raw
      .prepare(
        "INSERT INTO transactions (user_id, type, amount, category, occurred_on) VALUES (1, 'expense', 500, 'food', '2026-08-01')",
      )
      .run();

    await del(await signIn(), "original-password");
    const row = t.raw.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
    expect(row.n).toBe(0);
  });
});
