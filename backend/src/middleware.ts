import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "./lib/auth";
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

/** Requires a valid `Authorization: Bearer <jwt>` header; attaches the user to the context. */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }
  const token = header.slice("Bearer ".length).trim();

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

  if (
    c.env.REQUIRE_VERIFIED_EMAIL === "true" &&
    !row.email_verified &&
    !new URL(c.req.url).pathname.startsWith(VERIFICATION_EXEMPT_PREFIX)
  ) {
    throw new HTTPException(403, {
      message: "Confirm your email address to use MyX. Check your inbox for the code.",
    });
  }

  c.set("user", payload);
  await next();
});
