import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";

/*
  General flood protection for the whole API.

  Deliberately NOT the D1 limiter used for login (lib/ratelimit.ts). That one
  exists because credential stuffing needs 15-minute windows and per-account
  lockout, which Cloudflare's binding cannot express. Here the requirement is
  the opposite — catch a flood within seconds — and the binding's 60s period is
  a fine fit.

  The deciding factor is cost. The D1 limiter writes a row per attempt. Putting
  that in front of every request would add one D1 write per API call, spending
  the very quota this is meant to protect. The binding is free and never touches
  the database.

  Keyed per user when signed in, per IP otherwise, so one noisy account cannot
  spend the shared D1 read allowance that every other user depends on.
*/

/** Generous enough that no real session notices; low enough to stop a script. */
export const API_LIMIT_PER_MINUTE = 300;

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const apiRateLimit: MiddlewareHandler<AppBindings> = async (c, next) => {
  const limiter = c.env.API_RATE_LIMIT;

  // Absent in local dev unless wrangler simulates it, and absent entirely if the
  // binding is ever removed. Failing open is deliberate: a missing limiter must
  // not take the whole API down, and auth stays protected by the D1 limiter.
  if (!limiter?.limit) return next();

  // The JWT is verified later by requireAuth; this only needs a stable key, so
  // reading the subject without verifying is fine — a forged token still just
  // buys the attacker their own bucket.
  const auth = c.req.header("Authorization");
  let key = `ip:${clientIp(c.req.raw.headers)}`;
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = JSON.parse(atob(auth.slice(7).split(".")[1] ?? ""));
      if (payload?.sub) key = `user:${payload.sub}`;
    } catch {
      // Malformed token — fall back to the IP bucket.
    }
  }

  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new HTTPException(429, { message: "Too many requests. Slow down and try again." });
  }

  return next();
};
