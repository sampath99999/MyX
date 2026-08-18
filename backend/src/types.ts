import type { JwtPayload } from "./lib/auth";

/** Cloudflare's rate-limiting binding (see wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  /** Optional so the API still runs if the binding is unavailable. */
  API_RATE_LIMIT?: RateLimiter;
  JWT_SECRET: string;
  APP_NAME: string;
  /** Comma-separated CORS allowlist. Optional — see lib/origins.ts for defaults. */
  ALLOWED_ORIGINS?: string;
  /**
   * Registration is closed once the owner account exists. Set to "true" to
   * reopen it (adding a family member later, say).
   */
  REGISTRATION_OPEN?: string;
  /** Cloudflare Email Sending binding. Absent until the domain is onboarded. */
  EMAIL?: {
    send(message: {
      to: string;
      from: { email: string; name?: string };
      subject: string;
      html: string;
      text: string;
    }): Promise<unknown>;
  };
  /** From address for outgoing mail; must be on an onboarded domain. */
  EMAIL_FROM?: string;
  /** Public origin, used to build password-reset links. */
  APP_URL?: string;
}

// Variables set on the Hono context by middleware.
export interface Variables {
  user: JwtPayload;
}

export type AppBindings = { Bindings: Env; Variables: Variables };
