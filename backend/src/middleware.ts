import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "./lib/auth";
import {
  looksLikeApiKey,
  resolveApiKey,
  shouldTouch,
  touchApiKey,
  type ApiKeyRecord,
} from "./lib/apikeys";
import type { AppBindings } from "./types";

/*
  Paths an unverified account may still reach when REQUIRE_VERIFIED_EMAIL is on.

  Without this list the gate is a trap: verifying needs a session, so blocking
  every authenticated route (or blocking login itself) leaves someone who never
  entered their code with no way to ever enter it. Signing in, reading /me,
  requesting a new code, entering one, and deleting the account all stay open —
  it is the *data* that waits for verification, not the door.
*/
const VERIFICATION_EXEMPT_PREFIX = "/api/auth/";

/*
  What an API key may never touch, however wide its scope.

  A key is meant to let a program read and write the *contents* of the account.
  It is not the account. Everything below either changes the credentials, ends
  sessions, mints more keys, or is the admin surface — and a leaked key that
  could do any of those would be indistinguishable from a leaked password, which
  is the whole thing keys exist to avoid.

  /api/keys is on the list for the obvious reason: a key that can create keys
  cannot be meaningfully revoked.
*/
const API_KEY_FORBIDDEN_PREFIXES = ["/api/auth", "/api/admin", "/api/keys"];

/*
  Where a read-only key is allowed to POST.

  The scope check below is "read keys cannot use unsafe methods", which is right
  for REST but wrong for MCP: every MCP call is a POST to this one path, and
  whether it reads or writes is decided by which tool it names. So the check
  moves inside — routes/mcp.ts hides write tools from a read key, and the
  internal dispatch each tool makes lands back here as a normal REST request and
  gets checked properly. Two layers, and the outer one still catches anything the
  inner one might miss.
*/
const SCOPE_CHECKED_INTERNALLY = "/api/mcp";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Requires `Authorization: Bearer <jwt | myx_ api key>`; attaches the user to the context. */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }
  const token = header.slice("Bearer ".length).trim();

  // Two credentials, one gate. Everything downstream reads c.get("user") and
  // never learns which one it was, so all 20 route modules gained API-key
  // support without a line of change.
  if (looksLikeApiKey(token)) {
    await authenticateApiKey(c, token);
    return next();
  }

  let payload;
  try {
    payload = await verifyToken(token, c.env.JWT_SECRET);
  } catch (e) {
    console.error("JWT verify failed:", (e as Error)?.name, (e as Error)?.message);
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  // A valid signature is not enough — the token must not have been revoked.
  // Logout and password changes bump users.token_version, which strands every
  // JWT issued before them. This is a primary-key lookup, so it is cheap next to
  // the queries the route handlers already run.
  // email_verified rides along on the same row: the gate below is then always
  // current and costs no extra query, where a JWT claim would go stale until the
  // next sign-in.
  const row = await c.env.DB.prepare(
    "SELECT token_version, email_verified FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first<{ token_version: number; email_verified: number }>();

  if (!row) throw new HTTPException(401, { message: "Invalid or expired token" });
  if ((payload.tv ?? 0) !== row.token_version) {
    throw new HTTPException(401, { message: "Session ended. Please sign in again." });
  }

  requireVerifiedEmail(c, row.email_verified);

  c.set("user", payload);
  c.set("auth", { via: "jwt", scope: "write" });
  await next();
});

/**
 * The API-key half of requireAuth.
 *
 * Ends by setting exactly the same `user` context the JWT path sets, so the
 * route handlers cannot tell the difference — the restrictions that make a key
 * lesser than a session are all applied here, before any of them run.
 */
async function authenticateApiKey(
  c: Context<AppBindings>,
  token: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  const record: ApiKeyRecord | null = await resolveApiKey(c.env.DB, token);
  // One message for "no such key", "expired" and "the account is gone". A
  // caller holding a bad key learns nothing from being told which.
  if (!record) throw new HTTPException(401, { message: "Invalid API key" });
  if (record.expires_at != null && record.expires_at <= now) {
    throw new HTTPException(401, { message: "Invalid API key" });
  }
  if (record.deleted_at != null) throw new HTTPException(401, { message: "Invalid API key" });

  requireVerifiedEmail(c, record.email_verified);

  const pathname = new URL(c.req.url).pathname;
  if (API_KEY_FORBIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    throw new HTTPException(403, {
      message: "API keys cannot access account or admin endpoints. Sign in to do that.",
    });
  }

  if (
    record.scope !== "write" &&
    !SAFE_METHODS.has(c.req.method) &&
    pathname !== SCOPE_CHECKED_INTERNALLY
  ) {
    throw new HTTPException(403, {
      message: "This API key is read-only.",
    });
  }

  /*
    The JWT payload shape, synthesised. sub/email/name are what handlers read;
    tv is meaningless for a key (nothing bumps it) and the lifetime fields
    describe this request rather than a token, because a key has no issue time
    and its expiry is enforced above rather than by anything downstream.
  */
  c.set("user", {
    sub: record.user_id,
    email: record.email,
    name: record.name,
    tv: 0,
    iat: now,
    exp: record.expires_at ?? now,
  });
  c.set("auth", { via: "api_key", scope: record.scope, keyId: record.id });

  if (shouldTouch(record, now)) {
    const write = touchApiKey(c.env.DB, record.id, now);
    // Hono's executionCtx getter throws when there is no ExecutionContext
    // (tests, some runtimes), so this cannot be optional-chained.
    try {
      c.executionCtx.waitUntil(write);
    } catch {
      void write;
    }
  }
}

/** The REQUIRE_VERIFIED_EMAIL gate, shared by both credentials. */
function requireVerifiedEmail(
  c: Context<AppBindings>,
  emailVerified: number,
): void {
  if (
    c.env.REQUIRE_VERIFIED_EMAIL === "true" &&
    !emailVerified &&
    !new URL(c.req.url).pathname.startsWith(VERIFICATION_EXEMPT_PREFIX)
  ) {
    throw new HTTPException(403, {
      message: "Confirm your email address to use MyX. Check your inbox for the code.",
    });
  }
}
