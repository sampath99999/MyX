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
  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    c.set("user", payload);
  } catch (e) {
    console.error("JWT verify failed:", (e as Error)?.name, (e as Error)?.message);
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  await next();
});
