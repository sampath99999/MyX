/*
  Reordering a board, through the real Hono apps against real SQLite.

  These two endpoints exist because the old ones could not express an order.
  `/tasks/:id/move` sets one task's section and position, which is enough to
  append a card to a column and nothing else; putting a card third means
  renumbering everything below it, and doing that as N calls races.

  What is worth pinning down is therefore not "does it write a row" but the
  three properties the board depends on: the whole column ends up numbered from
  zero with no gaps or ties, a move between columns leaves *both* columns
  correct, and neither endpoint can be pointed at somebody else's board.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import taskRoutes from "./tasks";
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
  app.route("/api/tasks", taskRoutes as Hono<AppBindings, any, any>);
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

/** Task ids in a section, in stored order. */
const idsIn = (sectionId: number | null) =>
  (
    t.raw
      .prepare(
        sectionId == null
          ? "SELECT id FROM tasks WHERE section_id IS NULL ORDER BY position, id"
          : "SELECT id FROM tasks WHERE section_id = ? ORDER BY position, id",
      )
      .all(...(sectionId == null ? [] : [sectionId])) as { id: number }[]
  ).map((r) => r.id);

const positionsIn = (sectionId: number) =>
  (
    t.raw
      .prepare("SELECT position FROM tasks WHERE section_id = ? ORDER BY position")
      .all(sectionId) as { position: number }[]
  ).map((r) => r.position);

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
      `INSERT INTO spaces (id, user_id, name) VALUES (1, 1, 'Personal'), (2, 2, 'Theirs')`,
    )
    .run();
  t.raw
    .prepare(
      `INSERT INTO projects (id, user_id, space_id, name) VALUES (1, 1, 1, 'Mine'), (2, 2, 2, 'Theirs')`,
    )
    .run();
  t.raw
    .prepare(
      `INSERT INTO sections (id, user_id, project_id, name, position) VALUES
         (1, 1, 1, 'To do', 0), (2, 1, 1, 'Doing', 1), (3, 1, 1, 'Done', 2),
         (9, 2, 2, 'Not yours', 0)`,
    )
    .run();
  // Three cards in "To do", one in "Doing".
  t.raw
    .prepare(
      `INSERT INTO tasks (id, user_id, space_id, project_id, section_id, title, position) VALUES
         (10, 1, 1, 1, 1, 'A', 0),
         (11, 1, 1, 1, 1, 'B', 1),
         (12, 1, 1, 1, 1, 'C', 2),
         (20, 1, 1, 1, 2, 'D', 0)`,
    )
    .run();

  mine = await signToken({ id: 1, email: "me@x.co", name: "Me", token_version: 0 }, JWT_SECRET);
  theirs = await signToken(
    { id: 2, email: "them@x.co", name: "Them", token_version: 0 },
    JWT_SECRET,
  );
});
afterEach(() => t.close());

describe("POST /api/tasks/reorder", () => {
  it("rewrites a column into the order it was given", async () => {
    const res = await call("/api/tasks/reorder", mine, "POST", {
      section_id: 1,
      ids: [12, 10, 11],
    });
    expect(res.status).toBe(200);
    expect(idsIn(1)).toEqual([12, 10, 11]);
  });

  it("numbers positions from zero with no gaps or ties", async () => {
    await call("/api/tasks/reorder", mine, "POST", { section_id: 1, ids: [12, 11, 10] });
    // A tie would let the list order flip between reads; a gap is how the old
    // append-only move drifted until two cards claimed the same slot.
    expect(positionsIn(1)).toEqual([0, 1, 2]);
  });

  it("moves a card between columns and renumbers the one it left", async () => {
    // C leaves "To do" and lands between D and the end of "Doing".
    await call("/api/tasks/reorder", mine, "POST", { section_id: 2, ids: [20, 12] });
    await call("/api/tasks/reorder", mine, "POST", { section_id: 1, ids: [10, 11] });

    expect(idsIn(2)).toEqual([20, 12]);
    expect(idsIn(1)).toEqual([10, 11]);
    expect(positionsIn(1)).toEqual([0, 1]);
  });

  it("puts a card at an exact index rather than only at the end", async () => {
    // The whole reason the endpoint exists: the old move appended, so this
    // arrangement was not reachable.
    await call("/api/tasks/reorder", mine, "POST", { section_id: 2, ids: [12, 20] });
    expect(idsIn(2)).toEqual([12, 20]);
  });

  it("accepts a null section, for a board whose first column holds strays", async () => {
    const res = await call("/api/tasks/reorder", mine, "POST", { section_id: null, ids: [10] });
    expect(res.status).toBe(200);
    expect(idsIn(null)).toEqual([10]);
  });

  it("is idempotent — replaying it lands in the same place", async () => {
    const body = { section_id: 1, ids: [11, 12, 10] };
    await call("/api/tasks/reorder", mine, "POST", body);
    await call("/api/tasks/reorder", mine, "POST", body);
    expect(idsIn(1)).toEqual([11, 12, 10]);
    expect(positionsIn(1)).toEqual([0, 1, 2]);
  });

  it("will not move another account's tasks", async () => {
    await call("/api/tasks/reorder", theirs, "POST", { section_id: null, ids: [10, 11, 12] });
    // Scoped by user_id, so the statements match nothing and the board stands.
    expect(idsIn(1)).toEqual([10, 11, 12]);
  });

  it("will not file tasks into a section it does not own", async () => {
    const res = await call("/api/tasks/reorder", mine, "POST", { section_id: 9, ids: [10] });
    expect(res.status).toBe(404);
    expect(idsIn(1)).toEqual([10, 11, 12]);
  });

  it("rejects a payload larger than the batch ceiling", async () => {
    const res = await call("/api/tasks/reorder", mine, "POST", {
      section_id: 1,
      ids: Array.from({ length: 201 }, (_, i) => i + 1),
    });
    expect(res.status).toBe(400);
  });

  it("treats an empty list as a no-op rather than an error", async () => {
    const res = await call("/api/tasks/reorder", mine, "POST", { section_id: 1, ids: [] });
    expect(res.status).toBe(200);
    expect(idsIn(1)).toEqual([10, 11, 12]);
  });
});

describe("POST /api/projects/:id/sections/reorder", () => {
  const columnOrder = () =>
    (
      t.raw
        .prepare("SELECT id FROM sections WHERE project_id = 1 ORDER BY position, id")
        .all() as { id: number }[]
    ).map((r) => r.id);

  it("rewrites the columns into the order it was given", async () => {
    const res = await call("/api/projects/1/sections/reorder", mine, "POST", { ids: [3, 1, 2] });
    expect(res.status).toBe(200);
    expect(columnOrder()).toEqual([3, 1, 2]);
  });

  it("will not reorder a project belonging to someone else", async () => {
    await call("/api/projects/1/sections/reorder", theirs, "POST", { ids: [3, 2, 1] });
    expect(columnOrder()).toEqual([1, 2, 3]);
  });

  it("ignores ids from another project rather than adopting them", async () => {
    // Section 9 belongs to user 2's project; naming it here must not pull it in.
    await call("/api/projects/1/sections/reorder", mine, "POST", { ids: [9, 1, 2, 3] });
    const stray = t.raw.prepare("SELECT project_id FROM sections WHERE id = 9").get() as {
      project_id: number;
    };
    expect(stray.project_id).toBe(2);
  });

  it("rejects an empty or malformed list", async () => {
    expect((await call("/api/projects/1/sections/reorder", mine, "POST", { ids: [] })).status).toBe(
      400,
    );
    expect(
      (await call("/api/projects/1/sections/reorder", mine, "POST", { ids: "nope" })).status,
    ).toBe(400);
  });
});
