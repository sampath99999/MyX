import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import { toGrams } from "../lib/nutrition";
import type { AppBindings } from "../types";

/*
  The food library: built-ins plus whatever this account has added.

  Two things here carry most of the module's usability.

  Personal rows shadow built-ins. Editing a seeded food does not change the
  shared row — it writes a copy owned by this account, and the copy hides the
  original from every list. The seeded numbers are estimates, so being able to
  correct the twenty foods you actually eat is the difference between a log you
  trust and one you argue with.

  Recents and frequents come before search. Most logging is repetition: the same
  breakfast, the same chai. A picker that opens on what you ate yesterday is a
  tap; one that opens on an empty search box is a chore, and a chore gets
  abandoned inside a week.
*/

const foods = new Hono<AppBindings>();
foods.use("*", requireAuth);

interface FoodRow {
  id: number;
  user_id: number | null;
  name: string;
  category: string;
  serving_label: string;
  serving_grams: number | null;
  kcal: number;
  protein_cg: number;
  carbs_cg: number;
  fat_cg: number;
  fibre_cg: number;
  copied_from: number | null;
}

/** Macros go out as grams; the centigram storage is an implementation detail. */
function serialize(f: FoodRow) {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    serving_label: f.serving_label,
    serving_grams: f.serving_grams,
    kcal: f.kcal,
    protein: toGrams(f.protein_cg),
    carbs: toGrams(f.carbs_cg),
    fat: toGrams(f.fat_cg),
    fibre: toGrams(f.fibre_cg),
    custom: f.user_id !== null,
  };
}

const SELECT = `SELECT id, user_id, name, category, serving_label, serving_grams,
                       kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, copied_from
                  FROM foods`;

/**
 * Visible to this user: their own rows, plus built-ins they have not copied.
 *
 * The NOT EXISTS is what makes an edited built-in replace rather than duplicate
 * the original. Without it, correcting "Idli" leaves two Idlis in the picker and
 * a coin flip over which one gets logged.
 */
const VISIBLE = `(f.user_id = ?1 OR (f.user_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM foods c
                                    WHERE c.user_id = ?1 AND c.copied_from = f.id)))`;

/** LIKE has its own wildcards; a user typing % should not match everything. */
function likeTerm(raw: string): string {
  return `%${raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** GET /api/foods?q=&category=&limit= — the picker's search. */
foods.get("/", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim();
  const category = c.req.query("category");
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 200);

  const where = [VISIBLE];
  const binds: unknown[] = [user.sub];

  if (q) {
    where.push(`f.name LIKE ?${binds.length + 1} ESCAPE '\\'`);
    binds.push(likeTerm(q));
  }
  if (category) {
    where.push(`f.category = ?${binds.length + 1}`);
    binds.push(category);
  }

  /*
    A name that starts with the term outranks one that merely contains it —
    typing "dal" should lead with "Dal tadka", not "Bisi bele bath". Custom rows
    come first within each tier, because a food someone bothered to add is one
    they eat.
  */
  const order = q
    ? `CASE WHEN f.name LIKE ?${binds.length + 1} ESCAPE '\\' THEN 0 ELSE 1 END,
       f.user_id IS NULL, f.name`
    : // Plain alphabetical when nothing has been typed. Ordering by category
      // first sorted "alcohol" to the top, so the food library opened on beer,
      // red wine and whisky — a strange thing to greet someone with, and not
      // what anyone is looking for.
      "f.user_id IS NULL, f.name";
  if (q) binds.push(`${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);

  const { results } = await c.env.DB.prepare(
    `${SELECT} f WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?${binds.length + 1}`,
  )
    .bind(...binds, limit)
    .all<FoodRow>();

  return c.json({ foods: (results ?? []).map(serialize) });
});

/**
 * GET /api/foods/suggestions — what to show before anyone types.
 *
 * Recent is ordered by when it was last eaten, frequent by how often over the
 * last three months. Both are capped small: this is a shortcut list, and a
 * shortcut with thirty entries is just another search.
 */
foods.get("/suggestions", async (c) => {
  const user = c.get("user");

  const recent = await c.env.DB.prepare(
    `${SELECT} f WHERE ${VISIBLE} AND f.id IN (
        SELECT food_id FROM meal_entries
         WHERE user_id = ?1 AND food_id IS NOT NULL
         GROUP BY food_id ORDER BY MAX(logged_on) DESC, MAX(id) DESC LIMIT 12)
      ORDER BY (SELECT MAX(id) FROM meal_entries e WHERE e.food_id = f.id AND e.user_id = ?1) DESC`,
  )
    .bind(user.sub)
    .all<FoodRow>();

  const frequent = await c.env.DB.prepare(
    `${SELECT} f WHERE ${VISIBLE} AND f.id IN (
        SELECT food_id FROM meal_entries
         WHERE user_id = ?1 AND food_id IS NOT NULL AND logged_on >= date('now', '-90 days')
         GROUP BY food_id ORDER BY COUNT(*) DESC LIMIT 12)`,
  )
    .bind(user.sub)
    .all<FoodRow>();

  return c.json({
    recent: (recent.results ?? []).map(serialize),
    frequent: (frequent.results ?? []).map(serialize),
  });
});

/** GET /api/foods/categories — for the picker's filter chips. */
foods.get("/categories", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT f.category, COUNT(*) AS n FROM foods f WHERE ${VISIBLE}
      GROUP BY f.category ORDER BY f.category`,
  )
    .bind(user.sub)
    .all<{ category: string; n: number }>();
  return c.json({ categories: results ?? [] });
});

const MAX_KCAL = 5000;

/** Validates and normalises the nutrition half of a create/update body. */
function readNutrition(body: Record<string, unknown>, fallback?: FoodRow) {
  const num = (key: string, current: number) => {
    if (body[key] == null) return current;
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < 0) {
      throw new HTTPException(400, { message: `${key} must be a number of zero or more` });
    }
    return n;
  };

  const kcal = Math.round(num("kcal", fallback?.kcal ?? 0));
  if (kcal > MAX_KCAL) {
    throw new HTTPException(400, { message: `kcal must be ${MAX_KCAL} or less for one serving` });
  }

  return {
    kcal,
    protein_cg: Math.round(num("protein", (fallback?.protein_cg ?? 0) / 100) * 100),
    carbs_cg: Math.round(num("carbs", (fallback?.carbs_cg ?? 0) / 100) * 100),
    fat_cg: Math.round(num("fat", (fallback?.fat_cg ?? 0) / 100) * 100),
    fibre_cg: Math.round(num("fibre", (fallback?.fibre_cg ?? 0) / 100) * 100),
  };
}

/** POST /api/foods — add something the library does not have. */
foods.post("/", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => null)) ?? {};

  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) throw new HTTPException(400, { message: "Give the food a name" });

  const serving = String(body.serving_label ?? "").trim().slice(0, 40) || "1 serving";
  const category = String(body.category ?? "other").trim().slice(0, 20) || "other";
  const grams = body.serving_grams != null ? Math.round(Number(body.serving_grams)) : null;
  const n = readNutrition(body);

  const created = await c.env.DB.prepare(
    `INSERT INTO foods (user_id, name, category, serving_label, serving_grams,
                        kcal, protein_cg, carbs_cg, fat_cg, fibre_cg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, user_id, name, category, serving_label, serving_grams,
               kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, copied_from`,
  )
    .bind(
      user.sub,
      name,
      category,
      serving,
      Number.isFinite(grams as number) ? grams : null,
      n.kcal,
      n.protein_cg,
      n.carbs_cg,
      n.fat_cg,
      n.fibre_cg,
    )
    .first<FoodRow>();

  return c.json({ food: serialize(created!) }, 201);
});

/**
 * PATCH /api/foods/:id — correct a food.
 *
 * On a personal row this updates in place. On a built-in it writes a copy owned
 * by the caller, because the built-ins are shared: one account deciding its
 * idlis are larger must not change anybody else's breakfast.
 */
foods.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const body = (await c.req.json().catch(() => null)) ?? {};

  const existing = await c.env.DB.prepare(
    `${SELECT} WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
  )
    .bind(id, user.sub)
    .first<FoodRow>();
  if (!existing) throw new HTTPException(404, { message: "Food not found" });

  const name = body.name != null ? String(body.name).trim().slice(0, 80) : existing.name;
  if (!name) throw new HTTPException(400, { message: "Give the food a name" });
  const serving =
    body.serving_label != null
      ? String(body.serving_label).trim().slice(0, 40) || existing.serving_label
      : existing.serving_label;
  const category =
    body.category != null ? String(body.category).trim().slice(0, 20) : existing.category;
  const n = readNutrition(body, existing);

  if (existing.user_id === null) {
    const copy = await c.env.DB.prepare(
      `INSERT INTO foods (user_id, name, category, serving_label, serving_grams,
                          kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, copied_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, user_id, name, category, serving_label, serving_grams,
                 kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, copied_from`,
    )
      .bind(
        user.sub,
        name,
        category,
        serving,
        existing.serving_grams,
        n.kcal,
        n.protein_cg,
        n.carbs_cg,
        n.fat_cg,
        n.fibre_cg,
        existing.id,
      )
      .first<FoodRow>();
    return c.json({ food: serialize(copy!), copied: true });
  }

  const updated = await c.env.DB.prepare(
    `UPDATE foods SET name = ?, category = ?, serving_label = ?, kcal = ?,
            protein_cg = ?, carbs_cg = ?, fat_cg = ?, fibre_cg = ?
      WHERE id = ? AND user_id = ?
      RETURNING id, user_id, name, category, serving_label, serving_grams,
                kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, copied_from`,
  )
    .bind(
      name,
      category,
      serving,
      n.kcal,
      n.protein_cg,
      n.carbs_cg,
      n.fat_cg,
      n.fibre_cg,
      id,
      user.sub,
    )
    .first<FoodRow>();

  return c.json({ food: serialize(updated!), copied: false });
});

/**
 * DELETE /api/foods/:id — only ever a personal row.
 *
 * A built-in cannot be deleted, only shadowed by a copy. Entries already logged
 * survive either way: meal_entries carries its own name and nutrition, and the
 * foreign key is ON DELETE SET NULL.
 */
foods.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM foods WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) {
    throw new HTTPException(404, {
      message: "That food is either missing or built in — built-in foods can be edited, not deleted.",
    });
  }
  return c.json({ ok: true });
});

export default foods;
