import type { JwtPayload } from "./lib/auth";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  APP_NAME: string;
  /** Comma-separated CORS allowlist. Optional — see lib/origins.ts for defaults. */
  ALLOWED_ORIGINS?: string;
  /**
   * Registration is closed once the owner account exists. Set to "true" to
   * reopen it (adding a family member later, say).
   */
  REGISTRATION_OPEN?: string;
}

// Variables set on the Hono context by middleware.
export interface Variables {
  user: JwtPayload;
}

export type AppBindings = { Bindings: Env; Variables: Variables };
