import type { JwtPayload } from "./lib/auth";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  APP_NAME: string;
}

// Variables set on the Hono context by middleware.
export interface Variables {
  user: JwtPayload;
}

export type AppBindings = { Bindings: Env; Variables: Variables };
