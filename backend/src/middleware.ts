import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "./lib/auth";
import type { AppBindings } from "./types";

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
  const row = await c.env.DB.prepare("SELECT token_version FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<{ token_version: number }>();

  if (!row) throw new HTTPException(401, { message: "Invalid or expired token" });
  if ((payload.tv ?? 0) !== row.token_version) {
    throw new HTTPException(401, { message: "Session ended. Please sign in again." });
  }

  c.set("user", payload);
  await next();
});
