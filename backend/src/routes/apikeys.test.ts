/*
  API keys, through the real Hono apps against real SQLite.

  Two properties carry the whole feature. A key must reach the account's data —
  otherwise it is useless — and it must not reach the account itself, because a
  key that can change the password or mint more keys is just the password with
  extra steps. Everything else here defends one of those two.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import keyRoutes from "./apikeys";
import spaceRoutes from "./spaces";
import taskRoutes from "./tasks";
import authRoutes from "./auth";
import adminRoutes from "./admin";
import { createTestDb, type TestDb } from "../test-support/d1";
import { signToken } from "../lib/auth";
import {
  API_KEY_PREFIX,
  DISPLAY_PREFIX_LENGTH,
  hashApiKey,
  LAST_USED_THROTTLE_SECONDS,
  MAX_KEYS_PER_USER,
} from "../lib/apikeys";
import type { AppBindings } from "../types";

let t: TestDb;
let session: string;
const JWT_SECRET = "test-secret";

/* eslint-disable @typescript-eslint/no-explicit-any */
function call(path: string, credential: string, method = "GET", body?: unknown) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/keys", keyRoutes as Hono<AppBindings, any, any>);
  app.route("/api/spaces", spaceRoutes as Hono<AppBindings, any, any>);
  app.route("/api/tasks", taskRoutes as Hono<AppBindings, any, any>);
  app.route("/api/auth", authRoutes as Hono<AppBindings, any, any>);
  app.route("/api/admin", adminRoutes as Hono<AppBindings, any, any>);

  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { DB: t.db, JWT_SECRET, APP_NAME: "MyX" },
  );
}

const json = async (res: Response) => (await res.json()) as any;

/** Mint a key the way the UI does, and hand back the plaintext. */
async function mintKey(scope: "read" | "write" = "write"): Promise<string> {
  const res = await call("/api/keys", session, "POST", { name: `${scope} key`, scope });
  expect(res.status).toBe(201);
  return (await json(res)).token as string;
}

/** Write a key straight into the table, for the states the API will not create. */
async function insertKey(token: string, fields: Record<string, unknown> = {}) {
  const row = {
    user_id: 1,
    name: "planted",
    scope: "write",
    created_at: Math.floor(Date.now() / 1000),
    last_used_at: null,
    expires_at: null,
    ...fields,
  };
  t.raw
    .prepare(
      `INSERT INTO api_keys (user_id, name, key_hash, prefix, scope, created_at, last_used_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.user_id as number,
      row.name as string,
      await hashApiKey(token),
      token.slice(0, DISPLAY_PREFIX_LENGTH),
      row.scope as string,
      row.created_at as number,
      row.last_used_at as number | null,
      row.expires_at as number | null,
    );
}

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, email_verified) VALUES
         (1, 'me@x.co', 'Me', 'x', 1), (2, 'them@x.co', 'Them', 'x', 1)`,
    )
    .run();
  t.raw.prepare("UPDATE users SET is_admin = 1 WHERE id = 2").run();
  session = await signToken({ id: 1, email: "me@x.co", name: "Me" }, JWT_SECRET);
});

afterEach(() => t.close());

describe("minting a key", () => {
  it("returns the plaintext once and never again", async () => {
    const res = await call("/api/keys", session, "POST", { name: "OpenClaw" });
    const created = await json(res);

    expect(created.token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(created.key.prefix).toBe(created.token.slice(0, DISPLAY_PREFIX_LENGTH));

    const listed = await json(await call("/api/keys", session));
    expect(listed.keys).toHaveLength(1);
    expect(listed.keys[0].name).toBe("OpenClaw");
    // The one thing the list must never carry back.
    expect(JSON.stringify(listed)).not.toContain(created.token.slice(DISPLAY_PREFIX_LENGTH));
  });

  it("stores a hash, not the key", async () => {
    const token = await mintKey();
    const row = t.raw.prepare("SELECT key_hash FROM api_keys").get() as { key_hash: string };
    expect(row.key_hash).toBe(await hashApiKey(token));
    expect(row.key_hash).not.toContain(token);
  });

  it("gives every key a different value", async () => {
    const first = await mintKey();
    const second = await mintKey();
    expect(first).not.toBe(second);
  });

  it("insists on a name", async () => {
    const res = await call("/api/keys", session, "POST", { name: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects a scope that is neither read nor write", async () => {
    const res = await call("/api/keys", session, "POST", { name: "k", scope: "admin" });
    expect(res.status).toBe(400);
  });

  it("stops at the per-user cap", async () => {
    for (let i = 0; i < MAX_KEYS_PER_USER; i++) await mintKey();
    const res = await call("/api/keys", session, "POST", { name: "one too many" });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("Revoke one");
  });
});

describe("authenticating with a key", () => {
  it("reaches the account's data", async () => {
    const token = await mintKey();
    const res = await call("/api/spaces", token);
    expect(res.status).toBe(200);
    expect((await json(res)).spaces.length).toBeGreaterThan(0);
  });

  it("writes with it", async () => {
    const token = await mintKey();
    const { spaces } = await json(await call("/api/spaces", token));
    const res = await call("/api/tasks", token, "POST", {
      title: "from a key",
      space_id: spaces[0].id,
    });
    expect(res.status).toBe(201);
  });

  it("sees only its own owner's rows", async () => {
    // Somebody else's space, created through their own session.
    const theirs = await signToken({ id: 2, email: "them@x.co", name: "Them" }, JWT_SECRET);
    await call("/api/spaces", theirs, "POST", { name: "Theirs" });

    const token = await mintKey();
    const { spaces } = await json(await call("/api/spaces", token));
    expect(spaces.map((s: any) => s.name)).not.toContain("Theirs");
  });

  it("refuses a key that was revoked", async () => {
    const token = await mintKey();
    const { keys } = await json(await call("/api/keys", session));
    expect((await call(`/api/keys/${keys[0].id}`, session, "DELETE")).status).toBe(200);

    const res = await call("/api/spaces", token);
    expect(res.status).toBe(401);
  });

  it("refuses a key that has expired", async () => {
    const token = `${API_KEY_PREFIX}expired-key-value`;
    await insertKey(token, { expires_at: Math.floor(Date.now() / 1000) - 1 });
    expect((await call("/api/spaces", token)).status).toBe(401);
  });

  it("accepts one whose expiry is still ahead", async () => {
    const token = `${API_KEY_PREFIX}live-key-value`;
    await insertKey(token, { expires_at: Math.floor(Date.now() / 1000) + 3600 });
    expect((await call("/api/spaces", token)).status).toBe(200);
  });

  it("refuses a key belonging to a deleted account", async () => {
    const token = await mintKey();
    t.raw.prepare("UPDATE users SET deleted_at = ? WHERE id = 1").run(Math.floor(Date.now() / 1000));
    expect((await call("/api/spaces", token)).status).toBe(401);
  });

  it("refuses something merely shaped like a key", async () => {
    expect((await call("/api/spaces", `${API_KEY_PREFIX}not-a-real-key`)).status).toBe(401);
  });

  it("says nothing about why it was refused", async () => {
    const expired = `${API_KEY_PREFIX}expired-key-value`;
    await insertKey(expired, { expires_at: 1 });
    const unknown = `${API_KEY_PREFIX}never-existed-at-all`;

    const a = await json(await call("/api/spaces", expired));
    const b = await json(await call("/api/spaces", unknown));
    expect(a.error).toBe(b.error);
  });
});

describe("what a key may not do", () => {
  it("cannot touch the account", async () => {
    const token = await mintKey();
    for (const path of ["/api/auth/me", "/api/auth/export"]) {
      const res = await call(path, token);
      expect(res.status, path).toBe(403);
    }
    expect((await call("/api/auth/logout", token, "POST")).status).toBe(403);
    expect((await call("/api/auth/account", token, "DELETE")).status).toBe(403);
  });

  it("cannot mint or revoke keys", async () => {
    const token = await mintKey();
    expect((await call("/api/keys", token)).status).toBe(403);
    expect((await call("/api/keys", token, "POST", { name: "sneaky" })).status).toBe(403);
    expect((await call("/api/keys/1", token, "DELETE")).status).toBe(403);
  });

  it("cannot reach the admin surface", async () => {
    const token = await mintKey();
    expect((await call("/api/admin/stats", token)).status).toBe(403);
  });
});

describe("read-only scope", () => {
  it("reads", async () => {
    const token = await mintKey("read");
    expect((await call("/api/spaces", token)).status).toBe(200);
  });

  it("does not write", async () => {
    const token = await mintKey("read");
    const res = await call("/api/spaces", token, "POST", { name: "nope" });
    expect(res.status).toBe(403);
    expect((await json(res)).error).toContain("read-only");
  });

  it("does not write by PATCH or DELETE either", async () => {
    const token = await mintKey("read");
    expect((await call("/api/spaces/1", token, "PATCH", { name: "nope" })).status).toBe(403);
    expect((await call("/api/spaces/1", token, "DELETE")).status).toBe(403);
  });
});

describe("last_used_at", () => {
  it("is stamped on first use", async () => {
    const token = await mintKey();
    await call("/api/spaces", token);
    const row = t.raw.prepare("SELECT last_used_at FROM api_keys").get() as {
      last_used_at: number | null;
    };
    expect(row.last_used_at).toBeGreaterThan(0);
  });

  it("is left alone while it is still fresh, so reads cost no writes", async () => {
    const token = `${API_KEY_PREFIX}recently-used-key`;
    const recent = Math.floor(Date.now() / 1000) - 5;
    await insertKey(token, { last_used_at: recent });

    await call("/api/spaces", token);

    const row = t.raw.prepare("SELECT last_used_at FROM api_keys").get() as {
      last_used_at: number;
    };
    expect(row.last_used_at).toBe(recent);
  });

  it("is refreshed once it goes stale", async () => {
    const token = `${API_KEY_PREFIX}long-idle-key-value`;
    const stale = Math.floor(Date.now() / 1000) - LAST_USED_THROTTLE_SECONDS - 1;
    await insertKey(token, { last_used_at: stale });

    await call("/api/spaces", token);

    const row = t.raw.prepare("SELECT last_used_at FROM api_keys").get() as {
      last_used_at: number;
    };
    expect(row.last_used_at).toBeGreaterThan(stale);
  });
});

describe("revoking", () => {
  it("removes only the one asked for", async () => {
    await mintKey();
    const keep = await mintKey();
    const { keys } = await json(await call("/api/keys", session));
    const drop = keys.find((k: any) => k.prefix !== keep.slice(0, DISPLAY_PREFIX_LENGTH));

    await call(`/api/keys/${drop.id}`, session, "DELETE");
    expect((await call("/api/spaces", keep)).status).toBe(200);
  });

  it("cannot reach across accounts", async () => {
    await mintKey();
    const { keys } = await json(await call("/api/keys", session));
    const theirs = await signToken({ id: 2, email: "them@x.co", name: "Them" }, JWT_SECRET);

    const res = await call(`/api/keys/${keys[0].id}`, theirs, "DELETE");
    expect(res.status).toBe(404);
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM api_keys").get()).toMatchObject({ n: 1 });
  });
});

describe("the session credential", () => {
  it("still works everywhere it used to", async () => {
    expect((await call("/api/spaces", session)).status).toBe(200);
    expect((await call("/api/auth/me", session)).status).toBe(200);
    expect((await call("/api/keys", session)).status).toBe(200);
  });
});
