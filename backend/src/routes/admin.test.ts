/*
  Admin access control and error recording.

  The property that matters most is the first one: a normal signed-in user must
  not be able to tell these routes exist. Everything else about the screens is
  cosmetic next to that.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import adminRoutes from "./admin";
import { createTestDb, type TestDb } from "../test-support/d1";
import { signToken } from "../lib/auth";
import { recordError } from "../lib/errorlog";
import type { AppBindings, Env } from "../types";

let t: TestDb;
let sent: { to: string; text: string }[];
let adminToken: string;
let userToken: string;
const JWT_SECRET = "test-secret";

/* eslint-disable @typescript-eslint/no-explicit-any */
function call(path: string, token: string, method = "GET", body?: unknown) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/admin", adminRoutes as Hono<AppBindings, any, any>);

  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    {
      DB: t.db,
      JWT_SECRET,
      APP_NAME: "MyX",
      EMAIL: {
        send: async (m: { to: string; text: string }) => {
          sent.push({ to: m.to, text: m.text });
        },
      },
    },
  );
}

const env = () => ({ DB: t.db }) as unknown as Env;
const codeFromEmail = () => sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];

async function unlock() {
  await call("/api/admin/unlock", adminToken, "POST");
  await call("/api/admin/unlock/verify", adminToken, "POST", { code: codeFromEmail() });
}

beforeEach(async () => {
  t = createTestDb();
  sent = [];
  t.raw
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, is_admin) VALUES
         (1, 'owner@x.co', 'Owner', 'x', 1),
         (2, 'user@x.co',  'User',  'x', 0)`,
    )
    .run();
  adminToken = await signToken({ id: 1, email: "owner@x.co", name: "Owner", token_version: 0 }, JWT_SECRET);
  userToken = await signToken({ id: 2, email: "user@x.co", name: "User", token_version: 0 }, JWT_SECRET);
});
afterEach(() => {
  t.close();
  vi.restoreAllMocks();
});

describe("who can see the admin routes", () => {
  it("answers 404 to a normal user, not 403", async () => {
    /*
      A 403 would confirm there is something here worth finding. Every route
      must be indistinguishable from a path that does not exist.
    */
    for (const path of ["/api/admin/session", "/api/admin/stats", "/api/admin/errors"]) {
      const res = await call(path, userToken);
      expect(res.status).toBe(404);
    }
  });

  it("will not let a normal user request an unlock code", async () => {
    const res = await call("/api/admin/unlock", userToken, "POST");
    expect(res.status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it("requires a session at all", async () => {
    const app = new Hono<AppBindings>();
    app.route("/api/admin", adminRoutes as Hono<AppBindings, any, any>);
    const res = await app.request("/api/admin/stats", {}, { DB: t.db, JWT_SECRET, APP_NAME: "MyX" });
    expect(res.status).toBe(401);
  });

  it("cannot be granted through the API — only in the database", async () => {
    // There is deliberately no route that sets is_admin.
    const attempts = [
      call("/api/admin/session", userToken, "POST", { is_admin: 1 }),
      call("/api/admin/stats", userToken, "POST", { is_admin: true }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);

    const row = t.raw.prepare("SELECT is_admin FROM users WHERE id = 2").get() as {
      is_admin: number;
    };
    expect(row.is_admin).toBe(0);
  });
});

describe("the unlock gate", () => {
  it("keeps the screens locked for an admin who has not entered a code", async () => {
    const res = await call("/api/admin/stats", adminToken);
    expect(res.status).toBe(423);
  });

  it("opens them after the emailed code", async () => {
    await unlock();
    const res = await call("/api/admin/stats", adminToken);
    expect(res.status).toBe(200);
  });

  it("emails the code to the admin and never returns it", async () => {
    const res = await call("/api/admin/unlock", adminToken, "POST");
    expect(sent[0].to).toBe("owner@x.co");
    expect(JSON.stringify(await res.json())).not.toContain(codeFromEmail());
  });

  it("rejects a wrong code and stops accepting guesses after the cap", async () => {
    await call("/api/admin/unlock", adminToken, "POST");
    const right = codeFromEmail();
    const wrong = right === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      await call("/api/admin/unlock/verify", adminToken, "POST", { code: wrong });
    }
    // Budget spent — even the real code no longer opens it.
    const res = await call("/api/admin/unlock/verify", adminToken, "POST", { code: right });
    expect(res.status).toBe(400);
    expect((await call("/api/admin/stats", adminToken)).status).toBe(423);
  });

  it("locks again once the window passes", async () => {
    await unlock();
    t.raw
      .prepare("UPDATE admin_sessions SET unlocked_until = ? WHERE user_id = 1")
      .run(Math.floor(Date.now() / 1000) - 60);

    expect((await call("/api/admin/stats", adminToken)).status).toBe(423);
  });
});

describe("what it reports", () => {
  it("counts users and content without exposing any of it", async () => {
    t.raw
      .prepare(
        "INSERT INTO transactions (user_id, type, amount, category, note, occurred_on) VALUES (2, 'expense', 500, 'Food', 'a very private note', '2026-08-01')",
      )
      .run();
    await unlock();

    const res = await call("/api/admin/stats", adminToken);
    const body = await res.json();
    expect((body as any).users.total).toBe(2);
    expect((body as any).content.transactions).toBe(1);
    // Counts only — the contents of anyone's records never appear.
    expect(JSON.stringify(body)).not.toContain("a very private note");
  });

  it("lists open errors and hides resolved ones until they recur", async () => {
    await recordError(env(), {
      error: new Error("boom"),
      method: "POST",
      pathname: "/api/loans/1/pay",
      status: 500,
      userId: 2,
    });
    await unlock();

    const open = (await (await call("/api/admin/errors", adminToken)).json()) as any;
    expect(open.errors).toHaveLength(1);
    const fingerprint = open.errors[0].fingerprint;

    await call(`/api/admin/errors/${fingerprint}/resolve`, adminToken, "POST");
    const after = (await (await call("/api/admin/errors", adminToken)).json()) as any;
    expect(after.errors).toHaveLength(0);

    // Happening again reopens it — acknowledging is not the same as fixing.
    await recordError(env(), {
      error: new Error("boom"),
      method: "POST",
      pathname: "/api/loans/1/pay",
      status: 500,
    });
    const reopened = (await (await call("/api/admin/errors", adminToken)).json()) as any;
    expect(reopened.errors).toHaveLength(1);
  });
});

describe("recordError", () => {
  it("groups repeats into one row with a counter", async () => {
    for (let i = 0; i < 5; i++) {
      await recordError(env(), {
        error: new Error("D1_ERROR: no such column"),
        method: "GET",
        pathname: "/api/tasks",
        status: 500,
      });
    }

    const row = t.raw.prepare("SELECT count FROM error_log").get() as { count: number };
    const rows = t.raw.prepare("SELECT COUNT(*) AS n FROM error_log").get() as { n: number };
    // Five failures, one row — a loop must not cost a write per occurrence.
    expect(rows.n).toBe(1);
    expect(row.count).toBe(5);
  });

  it("groups the same failure across different record ids", async () => {
    for (const id of [1, 2, 3]) {
      await recordError(env(), {
        error: new Error("boom"),
        method: "POST",
        pathname: `/api/loans/${id}/pay`,
        status: 500,
      });
    }
    const rows = t.raw.prepare("SELECT COUNT(*) AS n FROM error_log").get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("groups messages that differ only by an embedded number", async () => {
    await recordError(env(), {
      error: new Error("Row 3: bad date"),
      method: "POST",
      pathname: "/api/transactions/import",
      status: 500,
    });
    await recordError(env(), {
      error: new Error("Row 47: bad date"),
      method: "POST",
      pathname: "/api/transactions/import",
      status: 500,
    });

    const rows = t.raw.prepare("SELECT COUNT(*) AS n FROM error_log").get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("keeps genuinely different failures apart", async () => {
    await recordError(env(), {
      error: new Error("boom"),
      method: "GET",
      pathname: "/api/tasks",
      status: 500,
    });
    await recordError(env(), {
      error: new Error("different problem entirely"),
      method: "GET",
      pathname: "/api/notes",
      status: 500,
    });

    const rows = t.raw.prepare("SELECT COUNT(*) AS n FROM error_log").get() as { n: number };
    expect(rows.n).toBe(2);
  });

  it("never throws, whatever it is handed", async () => {
    // Failing to record a failure must not become the response the user sees.
    await expect(
      recordError(env(), { error: "a string, not an Error", method: "GET", pathname: "/x", status: 500 }),
    ).resolves.toBeUndefined();

    const broken = { DB: { prepare: () => { throw new Error("db is gone"); } } } as unknown as Env;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordError(broken, { error: new Error("boom"), method: "GET", pathname: "/x", status: 500 }),
    ).resolves.toBeUndefined();
  });
});
