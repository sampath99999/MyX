// Minimal D1Database adapter over Node's built-in SQLite, for tests.
//
// D1 is SQLite, so running the real statements against a real engine catches
// things a hand-written mock never would — ON CONFLICT behaviour, UNIQUE index
// violations, NULL handling in aggregates. Only the surface the app actually
// uses is implemented.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, unknown>;

class Stmt {
  private args: unknown[] = [];
  constructor(
    private db: DatabaseSync,
    private sql: string,
  ) {}

  bind(...args: unknown[]) {
    // D1 accepts booleans; node:sqlite does not, so normalise to integers.
    this.args = args.map((a) => (typeof a === "boolean" ? (a ? 1 : 0) : a));
    return this;
  }

  first<T = Row>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.args as never[]));
    return Promise.resolve((row as T) ?? null);
  }

  all<T = Row>(): Promise<{ results: T[]; success: true }> {
    const rows = this.db.prepare(this.sql).all(...(this.args as never[]));
    return Promise.resolve({ results: rows as T[], success: true });
  }

  run(): Promise<{ success: true; meta: { changes: number } }> {
    const res = this.db.prepare(this.sql).run(...(this.args as never[]));
    return Promise.resolve({ success: true, meta: { changes: Number(res.changes) } });
  }

  /*
    What a batched statement gives back.

    D1's batch() returns a full D1Result per statement — rows included — so a
    batch of SELECTs is a legitimate way to make one round trip out of twenty
    (see lib/export.ts). This used to call run() for every statement, which
    executes the query but throws the rows away, so batched reads came back
    empty and the code under test looked like it had found nothing.
  */
  batched(): Promise<{ success: true; results: Row[]; meta: { changes: number } }> {
    const stmt = this.db.prepare(this.sql);
    const reads = /^\s*(select|with)\b/i.test(this.sql);
    if (reads || /\breturning\b/i.test(this.sql)) {
      const results = stmt.all(...(this.args as never[])) as Row[];
      return Promise.resolve({
        success: true,
        results,
        meta: { changes: reads ? 0 : results.length },
      });
    }
    const res = stmt.run(...(this.args as never[]));
    return Promise.resolve({ success: true, results: [], meta: { changes: Number(res.changes) } });
  }
}

export interface TestDb {
  db: unknown; // satisfies the D1Database shape the app calls
  raw: DatabaseSync;
  close(): void;
}

/** In-memory database with every migration in migrations/ applied in order. */
export function createTestDb(migrationsDir = join(import.meta.dirname, "../../migrations")): TestDb {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON;");

  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }

  const api = {
    prepare: (sql: string) => new Stmt(raw, sql),
    batch: async (stmts: Stmt[]) => {
      // D1 batches are atomic; mirror that so rollback behaviour is testable.
      raw.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.batched());
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };

  return { db: api, raw, close: () => raw.close() };
}
