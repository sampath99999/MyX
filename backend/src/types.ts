import type { JwtPayload } from "./lib/auth";
import type { ApiKeyScope } from "./lib/apikeys";

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
  /**
   * Resend API key (a secret, set with `wrangler secret put RESEND_API_KEY`).
   * Preferred transport: its free tier needs no paid plan, unlike Cloudflare
   * Email Sending, which requires Workers Paid.
   */
  RESEND_API_KEY?: string;
  /** Cloudflare Email Sending binding. Kept because wrangler dev simulates it. */
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
  /**
   * Minutes east of UTC used to decide the digest's "today". Defaults to 330
   * (IST) — the app deals in rupees, and its users' day does not start at UTC
   * midnight.
   */
  DIGEST_TZ_OFFSET_MINUTES?: string;
  /** Public origin, used to build password-reset links. */
  APP_URL?: string;
  /**
   * When "true", an unverified address cannot sign in. Left off until the
   * sending domain is confirmed working — otherwise it locks out everyone who
   * signed up while the codes were going nowhere.
   */
  REQUIRE_VERIFIED_EMAIL?: string;
}

/**
 * Which credential got this request through requireAuth.
 *
 * Handlers deliberately do not need this — a key and a session produce the same
 * `user`, which is what let every existing route accept keys unchanged. It
 * exists for the one place that must know: routes/mcp.ts, which decides from the
 * scope whether to offer the write tools at all.
 */
export interface AuthContext {
  via: "jwt" | "api_key";
  scope: ApiKeyScope;
  /** api_keys.id, when the credential was a key. */
  keyId?: number;
}

// Variables set on the Hono context by middleware.
export interface Variables {
  user: JwtPayload;
  auth: AuthContext;
}

export type AppBindings = { Bindings: Env; Variables: Variables };
