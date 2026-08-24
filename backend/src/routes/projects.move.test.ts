/*
  Moving a project from one space to another.

  The interesting part is not the project row. Tasks carry their own space_id
  alongside their project_id, and the Today / Upcoming / Inbox views filter on
  the task's space rather than on its project's — so a project that moves
  without its tasks leaves them filed under a project in the new space while
  still counted against the old one. Nothing errors; the work just quietly
  stops appearing where anyone would look for it.

  These pin that down, along with the boundary that stops a project being filed
  into somebody else's space.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import projectRoutes from "./projects";
import { createTestDb, type TestDb } from "../test-support/d1";
import { signToken } from "../lib/auth";
import type { AppBindings } from "../types";

let t: TestDb;
let mine: string;
let theirs: string;
const JWT_SECRET = "test-secret";

/* eslint-disable @typescript-eslint/no-explicit-any */
function call(path: string, token: string, method = "GET", body?: unknown) {
  const app = new Hono<AppBindings>();
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ error: err.message }, err.status)
      : c.json({ error: String(err) }, 500),
  );
  app.route("/api/projects", projectRoutes as Hono<AppBindings, any, any>);
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { DB: t.db, JWT_SECRET, APP_NAME: "MyX" },
  );
}

const project = (id: number) =>
  t.raw.prepare("SELECT space_id, name, position, view FROM projects WHERE id = ?").get(id) as {
    space_id: number;
    name: string;
    position: number;
    view: string;
  };

const taskSpaces = (projectId: number) =>
  (
    t.raw
      .prepare("SELECT space_id FROM tasks WHERE project_id = ? ORDER BY id")
      .all(projectId) as { space_id: number }[]
  ).map((r) => r.space_id);

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare(
      `INSERT INTO users (id, email, name, password_hash) VALUES
         (1, 'me@x.co', 'Me', 'x'), (2, 'them@x.co', 'Them', 'x')`,
    )
    .run();
  t.raw
    .prepare(
      `INSERT INTO spaces (id, user_id, name) VALUES
         (1, 1, 'Personal'), (2, 1, 'Work'), (9, 2, 'Not mine')`,
    )
    .run();
  t.raw
    .prepare(
      `INSERT INTO projects (id, user_id, space_id, name, position) VALUES
         (1, 1, 1, 'Kitchen', 0),
         (2, 1, 2, 'Q3 platform', 0),
         (3, 1, 2, 'Hiring', 1)`,
    )
    .run();
  t.raw
    .prepare(
      `INSERT INTO tasks (id, user_id, space_id, project_id, title) VALUES
         (10, 1, 1, 1, 'Fix the tap'),
         (11, 1, 1, 1, 'Order tiles'),
         (12, 1, 2, 2, 'Untouched')`,
    )
    .run();

  mine = await signToken({ id: 1, email: "me@x.co", name: "Me", token_version: 0 }, JWT_SECRET);
  theirs = await signToken(
    { id: 2, email: "them@x.co", name: "Them", token_version: 0 },
    JWT_SECRET,
  );
});
afterEach(() => t.close());

describe("PATCH /api/projects/:id — moving spaces", () => {
  it("moves the project", async () => {
    const res = await call("/api/projects/1", mine, "PATCH", { space_id: 2 });
    expect(res.status).toBe(200);
    expect(project(1).space_id).toBe(2);
  });

  it("takes the project's tasks with it", async () => {
    await call("/api/projects/1", mine, "PATCH", { space_id: 2 });
    // Both tasks follow. Left behind, they would be counted against Personal
    // while living in a Work project.
    expect(taskSpaces(1)).toEqual([2, 2]);
  });

  it("leaves other projects' tasks alone", async () => {
    await call("/api/projects/1", mine, "PATCH", { space_id: 2 });
    expect(taskSpaces(2)).toEqual([2]);
  });

  it("lands at the end of the destination rather than colliding", async () => {
    // Space 2 already holds positions 0 and 1.
    await call("/api/projects/1", mine, "PATCH", { space_id: 2 });
    expect(project(1).position).toBe(2);
  });

  it("keeps everything else about the project", async () => {
    await call("/api/projects/1", mine, "PATCH", { view: "board" });
    await call("/api/projects/1", mine, "PATCH", { space_id: 2 });
    const p = project(1);
    expect(p.name).toBe("Kitchen");
    expect(p.view).toBe("board");
  });

  it("can rename and move in one request", async () => {
    await call("/api/projects/1", mine, "PATCH", { name: "Kitchen redo", space_id: 2 });
    const p = project(1);
    expect(p.name).toBe("Kitchen redo");
    expect(p.space_id).toBe(2);
  });

  it("refuses a space belonging to someone else", async () => {
    const res = await call("/api/projects/1", mine, "PATCH", { space_id: 9 });
    expect(res.status).toBe(404);
    // And nothing moved.
    expect(project(1).space_id).toBe(1);
    expect(taskSpaces(1)).toEqual([1, 1]);
  });

  it("refuses to touch someone else's project", async () => {
    const res = await call("/api/projects/1", theirs, "PATCH", { space_id: 9 });
    expect(res.status).toBe(404);
    expect(project(1).space_id).toBe(1);
  });

  it("rejects a malformed space_id rather than coercing it", async () => {
    const res = await call("/api/projects/1", mine, "PATCH", { space_id: "work" });
    expect(res.status).toBe(400);
    expect(project(1).space_id).toBe(1);
  });

  it("is a no-op when moved to the space it is already in", async () => {
    await call("/api/projects/2", mine, "PATCH", { space_id: 2 });
    const p = project(2);
    expect(p.space_id).toBe(2);
    // Position is untouched, so a stray same-space PATCH cannot reshuffle the list.
    expect(p.position).toBe(0);
  });
});
