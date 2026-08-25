/*
  The MCP server, driven exactly as a client drives it: JSON-RPC over one POST.

  The tests that matter most are the ones proving a tool call really runs the
  ordinary route — if that link ever breaks, MCP quietly becomes a second
  implementation of the app and starts drifting from it. So the write tests
  assert on the database afterwards, not on the response.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createMcpRoutes } from "./mcp";
import keyRoutes from "./apikeys";
import spaceRoutes from "./spaces";
import taskRoutes from "./tasks";
import txRoutes from "./transactions";
import noteRoutes from "./notes";
import { createTestDb, type TestDb } from "../test-support/d1";
import { signToken } from "../lib/auth";
import { TOOLS, toolsForScope } from "../lib/mcptools";
import type { AppBindings } from "../types";

let t: TestDb;
let session: string;
const JWT_SECRET = "test-secret";
const ENV = () => ({ DB: t.db, JWT_SECRET, APP_NAME: "MyX" });

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The wiring from index.ts, in miniature: the MCP route re-enters this app. */
function makeApp() {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/keys", keyRoutes as Hono<AppBindings, any, any>);
  app.route("/api/spaces", spaceRoutes as Hono<AppBindings, any, any>);
  app.route("/api/tasks", taskRoutes as Hono<AppBindings, any, any>);
  app.route("/api/transactions", txRoutes as Hono<AppBindings, any, any>);
  app.route("/api/notes", noteRoutes as Hono<AppBindings, any, any>);
  app.route(
    "/api/mcp",
    createMcpRoutes((request, env, ctx) => app.fetch(request, env, ctx)) as Hono<
      AppBindings,
      any,
      any
    >,
  );
  return app;
}

/** One JSON-RPC call. */
async function rpc(
  credential: string,
  method: string,
  params?: unknown,
  id: string | number | null = 1,
) {
  const res = await makeApp().request(
    "/api/mcp",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
      body: JSON.stringify(id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
    },
    ENV(),
  );
  return { status: res.status, body: res.status === 202 ? null : ((await res.json()) as any) };
}

/** A tool call, with its content already parsed back out of the text block. */
async function callTool(credential: string, name: string, args: Record<string, unknown> = {}) {
  const { body } = await rpc(credential, "tools/call", { name, arguments: args });
  const outcome = body.result;
  return {
    isError: outcome?.isError === true,
    text: outcome?.content?.[0]?.text as string,
    data: (() => {
      try {
        return JSON.parse(outcome?.content?.[0]?.text);
      } catch {
        return null;
      }
    })(),
  };
}

async function mintKey(scope: "read" | "write"): Promise<string> {
  const res = await makeApp().request(
    "/api/keys",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
      body: JSON.stringify({ name: `${scope} key`, scope }),
    },
    ENV(),
  );
  return ((await res.json()) as any).token;
}

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, email_verified) VALUES
         (1, 'me@x.co', 'Me', 'x', 1), (2, 'them@x.co', 'Them', 'x', 1)`,
    )
    .run();
  session = await signToken({ id: 1, email: "me@x.co", name: "Me" }, JWT_SECRET);
});

afterEach(() => t.close());

describe("the handshake", () => {
  it("answers initialize with the client's protocol when it knows it", async () => {
    const { body } = await rpc(session, "initialize", { protocolVersion: "2025-03-26" });
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo.name).toBe("myx");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("falls back to its newest for a version it does not know", async () => {
    const { body } = await rpc(session, "initialize", { protocolVersion: "1999-01-01" });
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("teaches the units and date format up front", async () => {
    const { body } = await rpc(session, "initialize", {});
    // The two mistakes that write bad data rather than merely failing.
    expect(body.result.instructions).toContain("rupees");
    expect(body.result.instructions).toContain("YYYY-MM-DD");
  });

  it("swallows notifications without a response body", async () => {
    const res = await makeApp().request(
      "/api/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      },
      ENV(),
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("answers ping", async () => {
    const { body } = await rpc(session, "ping");
    expect(body.result).toEqual({});
  });
});

describe("tools/list", () => {
  it("offers every tool to a full-access credential", async () => {
    const { body } = await rpc(session, "tools/list");
    expect(body.result.tools).toHaveLength(TOOLS.length);
  });

  it("hides the writes from a read-only key", async () => {
    const readKey = await mintKey("read");
    const { body } = await rpc(readKey, "tools/list");

    expect(body.result.tools).toHaveLength(toolsForScope("read").length);
    expect(body.result.tools.length).toBeLessThan(TOOLS.length);
    expect(body.result.tools.every((t: any) => t.annotations.readOnlyHint)).toBe(true);
  });

  it("describes every tool well enough to be picked without guessing", async () => {
    const { body } = await rpc(session, "tools/list");
    for (const tool of body.result.tools) {
      expect(tool.name, tool.name).toMatch(/^myx_[a-z_]+$/);
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
  });

  it("has no duplicate names", async () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });
});

describe("tools/call", () => {
  it("reads through the real route", async () => {
    const key = await mintKey("write");
    const { data } = await callTool(key, "myx_spaces_list");
    // Seeded by the spaces route itself — proof this went through it, not around it.
    expect(data.spaces.map((s: any) => s.name)).toContain("Personal");
  });

  it("writes through the real route, and the row is really there", async () => {
    const key = await mintKey("write");
    const { data: spaces } = await callTool(key, "myx_spaces_list");

    const created = await callTool(key, "myx_task_add", {
      title: "Buy milk",
      space_id: spaces.spaces[0].id,
      due_date: "2026-01-01",
      priority: 2,
    });
    expect(created.isError).toBe(false);

    const row = t.raw.prepare("SELECT title, priority, due_date, user_id FROM tasks").get();
    expect(row).toMatchObject({
      title: "Buy milk",
      priority: 2,
      due_date: "2026-01-01",
      user_id: 1,
    });
  });

  it("converts money the way the app does, not the way the caller guesses", async () => {
    const key = await mintKey("write");
    await callTool(key, "myx_transaction_add", {
      type: "expense",
      amount: 250.5,
      category: "Groceries",
      occurred_on: "2026-02-03",
    });
    // Rupees in, paise stored — the conversion belongs to the route and this
    // proves MCP did not reimplement it.
    expect(t.raw.prepare("SELECT amount FROM transactions").get()).toMatchObject({ amount: 25050 });
  });

  it("passes filters through as query parameters", async () => {
    const key = await mintKey("write");
    for (const [amount, category] of [[100, "Food"], [200, "Fuel"]] as const) {
      await callTool(key, "myx_transaction_add", {
        type: "expense",
        amount,
        category,
        occurred_on: "2026-02-03",
      });
    }

    const { data } = await callTool(key, "myx_transactions_list", { category: "Fuel" });
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].category).toBe("Fuel");
  });

  it("only omits what the caller left out, so a PATCH clears nothing", async () => {
    const key = await mintKey("write");
    const created = await callTool(key, "myx_note_create", {
      title: "Recipe",
      content: "# Dosa\nsoak the rice",
    });

    await callTool(key, "myx_note_update", { id: created.data.note.id, title: "Dosa recipe" });

    expect(t.raw.prepare("SELECT title, content FROM notes").get()).toMatchObject({
      title: "Dosa recipe",
      content: "# Dosa\nsoak the rice",
    });
  });

  it("hands the API's own complaint back to the model", async () => {
    const key = await mintKey("write");
    const failed = await callTool(key, "myx_task_add", { title: "no space given" });

    expect(failed.isError).toBe(true);
    // The message has to say what to fix; "HTTP 400" would not.
    expect(failed.text).toContain("space_id is required");
  });

  it("rejects an id that is not a number instead of putting it in the path", async () => {
    const key = await mintKey("write");
    const failed = await callTool(key, "myx_task_update", {
      id: "1/../../admin/stats",
      title: "x",
    });
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain("whole number");
  });

  it("cannot reach another account's rows", async () => {
    const theirSession = await signToken({ id: 2, email: "them@x.co", name: "Them" }, JWT_SECRET);
    await makeApp().request(
      "/api/spaces",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${theirSession}` },
        body: JSON.stringify({ name: "Theirs" }),
      },
      ENV(),
    );

    const key = await mintKey("write");
    const { data } = await callTool(key, "myx_spaces_list");
    expect(data.spaces.map((s: any) => s.name)).not.toContain("Theirs");
  });

  it("refuses a tool nobody defined", async () => {
    const { body } = await rpc(session, "tools/call", { name: "myx_drop_everything" });
    expect(body.error.code).toBe(-32602);
  });
});

describe("a read-only key", () => {
  it("reads", async () => {
    const readKey = await mintKey("read");
    const { isError } = await callTool(readKey, "myx_spaces_list");
    expect(isError).toBe(false);
  });

  it("is told the write tools do not exist, because for it they do not", async () => {
    const readKey = await mintKey("read");
    const { body } = await rpc(readKey, "tools/call", {
      name: "myx_task_add",
      arguments: { title: "x", space_id: 1 },
    });
    expect(body.error.code).toBe(-32602);
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM tasks").get()).toMatchObject({ n: 0 });
  });
});

describe("protocol errors", () => {
  it("names an unknown method", async () => {
    const { body } = await rpc(session, "resources/list");
    expect(body.error.code).toBe(-32601);
  });

  it("refuses a batch rather than half-handling it", async () => {
    const res = await makeApp().request(
      "/api/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
        body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]),
      },
      ENV(),
    );
    expect(((await res.json()) as any).error.code).toBe(-32600);
  });

  it("reports malformed JSON as a parse error", async () => {
    const res = await makeApp().request(
      "/api/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
        body: "{ not json",
      },
      ENV(),
    );
    expect(((await res.json()) as any).error.code).toBe(-32700);
  });

  it("echoes the request id back, so a client can match the reply", async () => {
    const { body } = await rpc(session, "ping", undefined, "abc-123");
    expect(body.id).toBe("abc-123");
  });

  it("says plainly that there is no server stream to open", async () => {
    const res = await makeApp().request(
      "/api/mcp",
      { headers: { Authorization: `Bearer ${session}` } },
      ENV(),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });
});

describe("authentication", () => {
  it("is required", async () => {
    const res = await makeApp().request(
      "/api/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
      ENV(),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a key that was revoked, mid-conversation", async () => {
    const key = await mintKey("write");
    t.raw.prepare("DELETE FROM api_keys").run();
    const { status } = await rpc(key, "tools/list");
    expect(status).toBe(401);
  });
});
