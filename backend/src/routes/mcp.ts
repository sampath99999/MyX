import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware";
import {
  findTool,
  toolsForScope,
  ToolArgumentError,
  type McpTool,
  type ToolArgs,
} from "../lib/mcptools";
import type { AppBindings, Env } from "../types";

/*
  MyX as an MCP server, so an assistant can use the account directly.

  MCP is what OpenClaw, Claude and the rest already speak, which makes this the
  short path to "my agent can see my tasks": one URL, one API key, no bespoke
  client for anyone to write. The transport is streamable-http and the server is
  stateless — no session id is issued, so every request stands alone and a
  restart on either side costs nothing.

  The protocol is implemented directly rather than through the MCP SDK. What is
  needed is four methods of JSON-RPC over one POST; the SDK brings a transport
  layer, a session manager and a dependency tree, for a Worker whose entire
  production dependency list is currently "hono". If server-initiated messages
  are ever wanted, that trade changes and so should this.

  What a tool call actually does lives in lib/mcptools.ts: it is re-dispatched
  into this same Hono app as an ordinary authenticated request, so there is no
  second implementation of anything.
*/

/** How the MCP route re-enters the app. Injected to keep index.ts's import acyclic. */
export type Dispatcher = (
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
) => Response | Promise<Response>;

/**
 * Protocol revisions this server can talk, newest first.
 *
 * Clients send the one they want; anything we recognise is echoed back, and
 * anything we do not is answered with our newest, which the spec allows and
 * every client handles by either accepting it or disconnecting cleanly.
 */
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_VERSION = "1.0.0";

/**
 * Sent once at initialize, before the model has called anything.
 *
 * Cheaper and more reliable than repeating these rules in twenty-odd tool
 * descriptions, and it covers the mistakes that are expensive rather than
 * merely wrong: money in the wrong unit and dates in the wrong format both
 * write bad data that looks fine until someone reads it months later.
 */
const INSTRUCTIONS = `MyX is one person's private life manager: money, tasks, notes, memories and checklists.

Conventions that apply everywhere:
- Money is in rupees (₹). 250.5 means ₹250.50. Never send paise.
- Dates are YYYY-MM-DD. "Today" is the user's today, not UTC — ask or use myx_dashboard if it matters.
- Every task belongs to a space (Personal, Work, ...). Call myx_spaces_list before creating one.

Start with myx_dashboard for "how am I doing" or "what needs me today", and myx_search when you know what something is called but not which module it is in.

Writes are real and mostly cannot be undone from here — nothing in this server deletes, but marking a bill paid creates a transaction and resetting a checklist discards its progress. Confirm those with the user first.`;

/* ---- JSON-RPC ------------------------------------------------------------ */

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const result = (id: string | number | null, value: unknown) => ({
  jsonrpc: "2.0" as const,
  id,
  result: value,
});

const failure = (id: string | number | null, code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message },
});

/** A tool that failed. Reported inside the result so the model can read and retry. */
const toolFailure = (message: string) => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

export function createMcpRoutes(dispatch: Dispatcher) {
  const mcp = new Hono<AppBindings>();
  mcp.use("*", requireAuth);

  /*
    Streamable HTTP allows a GET that opens a stream for server-initiated
    messages. This server has nothing to push, so saying so plainly is better
    than holding a connection open forever.
  */
  mcp.get("/", (c) =>
    c.json({ error: "This MCP server is POST-only; it opens no server stream." }, 405, {
      Allow: "POST",
    }),
  );

  mcp.post("/", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(failure(null, PARSE_ERROR, "Invalid JSON"), 400);
    }

    // JSON-RPC batching was removed from MCP in 2025-06-18. Refusing it outright
    // beats half-handling it and returning something no client expects.
    if (Array.isArray(payload)) {
      return c.json(failure(null, INVALID_REQUEST, "Batched requests are not supported"), 400);
    }

    const request = (payload ?? {}) as JsonRpcRequest;
    const id = request.id ?? null;
    const method = request.method;
    const params = request.params ?? {};

    if (typeof method !== "string") {
      return c.json(failure(id, INVALID_REQUEST, "Missing method"), 400);
    }

    // A notification has no id and, by the spec, gets no response body at all.
    if (request.id === undefined && method.startsWith("notifications/")) {
      return c.body(null, 202);
    }

    const scope = c.get("auth").scope;

    switch (method) {
      case "initialize": {
        const asked = String(params.protocolVersion ?? "");
        return c.json(
          result(id, {
            protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: "myx",
              title: c.env.APP_NAME ?? "MyX",
              version: SERVER_VERSION,
            },
            instructions: INSTRUCTIONS,
          }),
        );
      }

      case "ping":
        return c.json(result(id, {}));

      case "tools/list":
        return c.json(
          result(id, {
            tools: toolsForScope(scope).map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              // Read-only tools are worth flagging: a client that shows the user
              // an approval prompt can skip it for the ones that change nothing.
              annotations: { readOnlyHint: !t.write },
            })),
          }),
        );

      case "tools/call": {
        const name = String(params.name ?? "");
        const tool = findTool(name, scope);
        if (!tool) {
          /*
            A read-only key asking for a write tool lands here too, and is told
            the tool is unknown rather than forbidden — which is the truth from
            where it stands, since tools/list never offered it.
          */
          return c.json(failure(id, INVALID_PARAMS, `Unknown tool: ${name}`), 400);
        }

        const outcome = await callTool({
          base: c.req.url,
          authorization: c.req.header("Authorization") ?? "",
          tool,
          args: (params.arguments ?? {}) as ToolArgs,
          dispatch,
          env: c.env,
          ctx: executionCtx(c),
        });
        return c.json(result(id, outcome));
      }

      default:
        return c.json(failure(id, METHOD_NOT_FOUND, `Unknown method: ${method}`), 400);
    }
  });

  return mcp;
}

/**
 * Run one tool by making the MyX API call it describes.
 *
 * The caller's own Authorization header is forwarded rather than a fabricated
 * internal credential, which is what makes this safe to do at all: the inner
 * request is authenticated, scope-checked and user-scoped by exactly the
 * middleware every other request goes through. A read-only key that somehow
 * reached a write tool still gets a 403 here.
 */
async function callTool(call: {
  base: string;
  authorization: string;
  tool: McpTool;
  args: ToolArgs;
  dispatch: Dispatcher;
  env: Env;
  ctx: ExecutionContext | undefined;
}) {
  const { base, authorization, tool, args, dispatch, env, ctx } = call;
  let url: string;
  let body: string | undefined;
  try {
    url = new URL(tool.path(args), base).toString();
    body = tool.body ? JSON.stringify(tool.body(args)) : undefined;
  } catch (e) {
    if (e instanceof ToolArgumentError) return toolFailure(e.message);
    throw e;
  }

  const headers: Record<string, string> = { Authorization: authorization };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await dispatch(
    new Request(url, { method: tool.method, headers, body }),
    env,
    ctx,
  );

  const text = await response.text();
  if (!response.ok) {
    // The API's own message is the useful part — "space_id is required" tells
    // the model how to fix its call, where "HTTP 400" does not.
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // Not JSON; the raw body is still the best thing to hand back.
    }
    return toolFailure(`${tool.name} failed (${response.status}): ${message}`);
  }

  return { content: [{ type: "text", text }] };
}

/**
 * The ExecutionContext, when there is one.
 *
 * Hono's getter throws rather than returning undefined where no context exists
 * (tests, some runtimes), so this cannot be an optional chain. The cast bridges
 * Hono's structural ExecutionContext and the Workers one, which differ only in
 * fields nothing here touches.
 */
function executionCtx(c: Context<AppBindings>): ExecutionContext | undefined {
  try {
    return c.executionCtx as unknown as ExecutionContext;
  } catch {
    return undefined;
  }
}

export default createMcpRoutes;
