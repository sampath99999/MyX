# Connecting an AI assistant to MyX

MyX exposes itself as an **MCP server** at `POST /api/mcp`, authenticated with an
API key minted in **Settings → Connections**. Anything that speaks MCP —
OpenClaw, Claude, an editor — can then read and write the account.

- Live endpoint: `https://api-myx.samchitech.com/api/mcp`
- Local dev: `http://localhost:8787/api/mcp`
- Bundle for OpenClaw: [`integrations/openclaw-myx`](../integrations/openclaw-myx)

## Why MCP rather than a MyX-specific plugin

Every assistant worth connecting already speaks MCP, and a bespoke REST client
would have to be written once per assistant and kept in step with the API
forever. One MCP endpoint is understood by all of them on day one.

## Quick start

1. **Settings → Connections → Create key.** Choose read-only or read-and-write.
   The key is shown once; MyX keeps only a SHA-256 of it.
2. Point the client at the endpoint with the key as a bearer header:

```bash
openclaw mcp set myx '{"url":"https://api-myx.samchitech.com/api/mcp","transport":"streamable-http","headers":{"Authorization":"Bearer myx_..."}}'
```

3. `openclaw mcp tools myx` should list the `myx_*` tools.

## API keys

| | |
|---|---|
| Format | `myx_` + 32 random bytes, base64url |
| Stored as | hex SHA-256, nothing else (`api_keys.key_hash`) |
| Shown | once, at creation |
| Scopes | `read` (GET only) or `write` |
| Per account | 10 |
| Expiry | optional, up to 10 years |
| Revoking | deletes the row; the key fails on the next request |

`requireAuth` takes either credential — a `myx_`-prefixed bearer resolves through
`api_keys`, anything else is verified as a JWT — and sets the same `user` on the
context either way. That is why all twenty route modules accepted keys without a
line of change.

### What a key cannot do

Barred outright, whatever its scope (`API_KEY_FORBIDDEN_PREFIXES` in
[`middleware.ts`](../backend/src/middleware.ts)):

- `/api/auth/*` — no password change, no logout, no export, no account deletion
- `/api/admin/*`
- `/api/keys` — a key cannot mint or revoke keys, including itself

A key reaches the account's **contents**. It is not the account.

### Rate limiting and cost

Keys get their own bucket in the Cloudflare limiter, keyed on the public display
prefix, so an agent in a loop cannot throttle the owner's browser out of the same
account.

`last_used_at` is written at most once every five minutes
(`LAST_USED_THROTTLE_SECONDS`). Stamping it on every request would add a D1 write
per API call, which is exactly the free-tier quota `lib/usage.ts` exists to
protect.

## The MCP server

Stateless streamable-HTTP. No session id is issued, so every request stands alone.
JSON-RPC 2.0 over one POST; `GET` answers 405 because there is no server-initiated
stream. Batching is refused — MCP dropped it in 2025-06-18.

Implemented methods: `initialize`, `ping`, `tools/list`, `tools/call`, and
`notifications/*` (answered 202, no body). Protocol versions `2025-06-18`,
`2025-03-26`, `2024-11-05`.

The protocol is hand-rolled rather than taken from the MCP SDK: it is four
methods of JSON-RPC, against a Worker whose entire production dependency list is
`hono`. Revisit that if server-initiated messages are ever wanted.

### How a tool call runs

```
tools/call ──► lib/mcptools.ts descriptor ──► new Request(method, path, body)
                                                      │  same Authorization header
                                                      ▼
                                          app.fetch — the ordinary route
                                                      ▼
                                                     D1
```

Tools are declarative: a method, a path built from the arguments, and a body.
`routes/mcp.ts` turns one into a real Request and dispatches it back through the
same Hono app the browser talks to, forwarding the caller's own `Authorization`
header.

Two consequences worth stating plainly.

**There is no second implementation.** Validation, rupees-to-paise, `user_id`
predicates and every future fix apply to MCP automatically, because MCP is
running the same code.

**The inner request is authenticated on its own merits.** A read-only key that
somehow reached a write tool still gets a 403 from `requireAuth` on the inner
call — the scope filtering in `tools/list` is the first layer, not the only one.

### The tool set

Around thirty tools, not one per endpoint. An agent loads every description into
context before it can use any of them, so the list is the verbs people actually
ask for: `myx_dashboard`, `myx_search`, and per-module list/add/update.

**Nothing deletes.** MyX has no undo for most modules, and an agent that misreads
"clear my list" should not be able to take a year of transactions with it.
Deletion stays a deliberate act in the app.

Write tools are filtered out of `tools/list` for read-only keys, so a read key is
told the tool does not exist rather than that it is forbidden — which is the
truth from where it stands.

## Adding a tool

In [`backend/src/lib/mcptools.ts`](../backend/src/lib/mcptools.ts):

```ts
{
  name: "myx_labels_list",
  description: "…",                 // this is the agent's only manual — be specific
  inputSchema: { type: "object", properties: {} },
  write: true,                      // omit for read-only tools
  method: "GET",
  path: () => "/api/labels",
}
```

Use `pathId(args, "id")` for anything landing in the URL path — it rejects
non-integers, so `"1/../../admin"` cannot aim a tool at a route it was never
meant to reach. Use `present(args, [...])` for PATCH bodies so untouched fields
are omitted rather than cleared.

The test suite asserts every tool has a name matching `myx_[a-z_]+`, a
description long enough to choose from, and an object schema — a thin description
fails the build.

## Testing it by hand

```bash
curl -s http://localhost:8787/api/mcp \
  -H "Authorization: Bearer myx_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```
