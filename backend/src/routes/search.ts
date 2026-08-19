import { Hono } from "hono";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

/*
  One search across everything.

  Each module could already filter its own list, and none of them could see each
  other: finding "Zolve" meant knowing in advance whether it was a loan, a
  transaction note or a memory, then going to that screen and filtering there.
  That is fine with fifty rows and useless with five thousand.

  Ten small indexed lookups, sent as one D1 batch — one round trip, which matters
  because this runs on every keystroke after the debounce. The first version
  stitched them together with UNION ALL instead and D1 rejected it outright
  ("too many terms in compound SELECT"); a batch has no such ceiling and keeps
  each query's own ORDER BY intact.
*/

const search = new Hono<AppBindings>();
search.use("*", requireAuth);

/** Results per module. Enough to prove a match exists without burying the rest. */
const PER_TYPE = 5;
const MIN_QUERY = 2;

/**
 * LIKE has its own wildcards, so a user typing % or _ would otherwise match
 * everything or anything. Escaped, and paired with ESCAPE in the SQL below.
 */
function likeTerm(raw: string): string {
  return `%${raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

interface Row {
  id: number;
  title: string;
  subtitle: string | null;
  /** paise, or null for things that are not money. */
  amount: number | null;
  date: string | null;
}

/**
 * Every module, in the order results are shown.
 *
 * Each query maps its own columns onto the same five, so the client renders one
 * list rather than ten different shapes.
 */
const SOURCES: { kind: string; sql: string }[] = [
  {
    kind: "transaction",
    sql: `SELECT id, COALESCE(NULLIF(note, ''), category) AS title, category AS subtitle,
                 amount, occurred_on AS date
            FROM transactions
           WHERE user_id = ?1 AND (note LIKE ?2 ESCAPE '\\' OR category LIKE ?2 ESCAPE '\\')
           ORDER BY occurred_on DESC, id DESC LIMIT ${PER_TYPE}`,
  },
  {
    kind: "task",
    sql: `SELECT id, title, notes AS subtitle, NULL AS amount, due_date AS date
            FROM tasks
           WHERE user_id = ?1 AND (title LIKE ?2 ESCAPE '\\' OR notes LIKE ?2 ESCAPE '\\')
           ORDER BY status = 'done', COALESCE(due_date, '9999'), id LIMIT ${PER_TYPE}`,
  },
  {
    kind: "note",
    sql: `SELECT id, COALESCE(NULLIF(title, ''), 'Untitled') AS title,
                 substr(content, 1, 140) AS subtitle, NULL AS amount, updated_at AS date
            FROM notes
           WHERE user_id = ?1 AND archived = 0
             AND (title LIKE ?2 ESCAPE '\\' OR content LIKE ?2 ESCAPE '\\' OR tags LIKE ?2 ESCAPE '\\')
           ORDER BY pinned DESC, updated_at DESC LIMIT ${PER_TYPE}`,
  },
  {
    kind: "memory",
    sql: `SELECT id, title, substr(note, 1, 140) AS subtitle, NULL AS amount, occurred_on AS date
            FROM memories
           WHERE user_id = ?1
             AND (title LIKE ?2 ESCAPE '\\' OR note LIKE ?2 ESCAPE '\\' OR tags LIKE ?2 ESCAPE '\\')
           ORDER BY COALESCE(occurred_on, created_at) DESC LIMIT ${PER_TYPE}`,
  },
  {
    kind: "checklist",
    sql: `SELECT id, name AS title, NULL AS subtitle, NULL AS amount, NULL AS date
            FROM checklists
           WHERE user_id = ?1 AND name LIKE ?2 ESCAPE '\\'
           ORDER BY position, id LIMIT ${PER_TYPE}`,
  },
  {
    kind: "loan",
    sql: `SELECT id, name AS title, lender AS subtitle, outstanding AS amount, start_date AS date
            FROM loans
           WHERE user_id = ?1 AND (name LIKE ?2 ESCAPE '\\' OR lender LIKE ?2 ESCAPE '\\')
           ORDER BY status = 'closed', id LIMIT ${PER_TYPE}`,
  },
  {
    kind: "goal",
    sql: `SELECT id, name AS title, NULL AS subtitle, target_amount AS amount, target_date AS date
            FROM goals
           WHERE user_id = ?1 AND name LIKE ?2 ESCAPE '\\'
           ORDER BY completed_at IS NOT NULL, id LIMIT ${PER_TYPE}`,
  },
  {
    kind: "investment",
    sql: `SELECT id, name AS title, type AS subtitle, current_value AS amount, NULL AS date
            FROM investments
           WHERE user_id = ?1 AND (name LIKE ?2 ESCAPE '\\' OR notes LIKE ?2 ESCAPE '\\')
           ORDER BY id LIMIT ${PER_TYPE}`,
  },
  {
    kind: "recurring",
    sql: `SELECT id, name AS title, category AS subtitle, amount, next_due AS date
            FROM recurring
           WHERE user_id = ?1 AND (name LIKE ?2 ESCAPE '\\' OR category LIKE ?2 ESCAPE '\\')
           ORDER BY active DESC, next_due LIMIT ${PER_TYPE}`,
  },
  {
    kind: "project",
    sql: `SELECT id, name AS title, NULL AS subtitle, NULL AS amount, NULL AS date
            FROM projects
           WHERE user_id = ?1 AND archived = 0 AND name LIKE ?2 ESCAPE '\\'
           ORDER BY position, id LIMIT ${PER_TYPE}`,
  },
];

/** GET /api/search?q= — everything matching, grouped by module. */
search.get("/", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim();

  // Below two characters every query matches half the account, which is slower
  // and less useful than answering with nothing.
  if (q.length < MIN_QUERY) return c.json({ query: q, results: [] });

  const term = likeTerm(q);
  const batches = await c.env.DB.batch<Row>(
    SOURCES.map((s) => c.env.DB.prepare(s.sql).bind(user.sub, term)),
  );

  const results = batches.flatMap((batch, i) =>
    (batch.results ?? []).map((row) => ({
      kind: SOURCES[i].kind,
      id: row.id,
      title: row.title,
      subtitle: row.subtitle?.trim() ? row.subtitle.trim() : null,
      // Rupees at the boundary, the same as every other money route.
      amount: row.amount == null ? null : row.amount / 100,
      date: row.date,
    })),
  );

  return c.json({ query: q, results });
});

export default search;
