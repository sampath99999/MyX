// The registration gate: MyX is single-user on a public URL, so signup has to
// close itself once the owner exists. Exercised through the real Hono app
// against real SQLite, since the gate's whole job is a database check.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import authRoutes from "./auth";
import { createTestDb, type TestDb } from "../test-support/d1";
import type { AppBindings } from "../types";

let t: TestDb;

function appWith(env: Partial<AppBindings["Bindings"]>) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/auth", authRoutes);
  return (body: unknown) =>
    app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { DB: t.db, JWT_SECRET: "test-secret", APP_NAME: "MyX", ...env },
    );
}

const NEW_USER = { email: "someone@example.com", name: "Someone", password: "correct horse battery" };

beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.close());

describe("registration gate", () => {
  it("lets the very first account through, so a fresh deploy is usable", async () => {
    const res = await appWith({})(NEW_USER);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBeTruthy();
  });

  it("closes once an owner exists", async () => {
    await appWith({})(NEW_USER);
    const res = await appWith({})({ ...NEW_USER, email: "intruder@example.com" });
    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toEqual({
      error: "Registration is closed on this instance.",
    });
  });

  it("stays closed for an email that already exists (no user enumeration via 409)", async () => {
    await appWith({})(NEW_USER);
    const res = await appWith({})(NEW_USER);
    expect(res.status).toBe(403);
  });

  it("reopens when REGISTRATION_OPEN is set, for adding a family member later", async () => {
    await appWith({})(NEW_USER);
    const res = await appWith({ REGISTRATION_OPEN: "true" })({
      ...NEW_USER,
      email: "family@example.com",
    });
    expect(res.status).toBe(201);
  });

  it("treats any value other than \"true\" as closed", async () => {
    await appWith({})(NEW_USER);
    for (const value of ["1", "yes", "TRUE", ""]) {
      const res = await appWith({ REGISTRATION_OPEN: value })({
        ...NEW_USER,
        email: `x${value}@example.com`,
      });
      expect(res.status).toBe(403);
    }
  });
});
