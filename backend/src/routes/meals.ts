import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import {
  DEFAULT_TARGETS,
  MAX_QUANTITY_CX,
  MEALS,
  QUANTITY_SCALE,
  dateRe,
  deriveTargets,
  isMeal,
  scaleNutrition,
  sumNutrition,
  toCg,
  toGrams,
  type Activity,
  type Goal,
  type Nutrition,
  type Sex,
} from "../lib/nutrition";
import type { AppBindings } from "../types";

/*
  A day of eating: the entries, what they add up to, and what is left.

  The day view is one call on purpose. It is the screen the module opens on and
  the one thing anybody looks at, so it returns entries, per-meal subtotals, the
  day's totals, the targets and the remainder together — four round trips from a
  phone on a train is how a screen comes to feel slow.
*/

const meals = new Hono<AppBindings>();
meals.use("*", requireAuth);

interface EntryRow extends Nutrition {
  id: number;
  logged_on: string;
  meal: string;
  food_id: number | null;
  name: string;
  serving_label: string;
  quantity_cx: number;
  created_at: string;
}

function serializeEntry(e: EntryRow) {
  return {
    id: e.id,
    meal: e.meal,
    food_id: e.food_id,
    name: e.name,
    serving_label: e.serving_label,
    quantity: e.quantity_cx / QUANTITY_SCALE,
    kcal: e.kcal,
    protein: toGrams(e.protein_cg),
    carbs: toGrams(e.carbs_cg),
    fat: toGrams(e.fat_cg),
    fibre: toGrams(e.fibre_cg),
  };
}

const nutritionOut = (n: Nutrition) => ({
  kcal: n.kcal,
  protein: toGrams(n.protein_cg),
  carbs: toGrams(n.carbs_cg),
  fat: toGrams(n.fat_cg),
  fibre: toGrams(n.fibre_cg),
});

/** The requested day, or today. Rejects junk rather than binding it to D1. */
function readDate(raw: string | undefined, field = "date"): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (!dateRe.test(raw)) throw new HTTPException(400, { message: `${field} must be YYYY-MM-DD` });
  return raw;
}

interface TargetRow {
  kcal: number;
  protein_cg: number;
  carbs_cg: number;
  fat_cg: number;
  sex: Sex | null;
  age: number | null;
  height_cm: number | null;
  weight_g: number | null;
  activity: Activity | null;
  goal: Goal | null;
}

async function loadTargets(db: D1Database, userId: number) {
  const row = await db
    .prepare(
      `SELECT kcal, protein_cg, carbs_cg, fat_cg, sex, age, height_cm, weight_g, activity, goal
         FROM nutrition_targets WHERE user_id = ?`,
    )
    .bind(userId)
    .first<TargetRow>();
  return row;
}

/* ---- the day ------------------------------------------------------------- */

/** GET /api/meals/day?date=YYYY-MM-DD */
meals.get("/day", async (c) => {
  const user = c.get("user");
  const date = readDate(c.req.query("date"));

  const { results } = await c.env.DB.prepare(
    `SELECT id, logged_on, meal, food_id, name, serving_label, quantity_cx,
            kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, created_at
       FROM meal_entries WHERE user_id = ? AND logged_on = ?
      ORDER BY id`,
  )
    .bind(user.sub, date)
    .all<EntryRow>();

  const rows = results ?? [];
  const targets = await loadTargets(c.env.DB, user.sub);
  const target = targets ?? { ...DEFAULT_TARGETS, sex: null };

  // Every meal appears whether or not anything is in it — an empty Dinner with
  // an add button is the affordance; a missing Dinner is a puzzle.
  const byMeal = MEALS.map((meal) => {
    const entries = rows.filter((r) => r.meal === meal);
    return {
      meal,
      entries: entries.map(serializeEntry),
      totals: nutritionOut(sumNutrition(entries)),
    };
  });

  const totals = sumNutrition(rows);

  return c.json({
    date,
    meals: byMeal,
    totals: nutritionOut(totals),
    targets: {
      kcal: target.kcal,
      protein: toGrams(target.protein_cg),
      carbs: toGrams(target.carbs_cg),
      fat: toGrams(target.fat_cg),
    },
    // What is left is the number people act on at 8pm; consumed is the number
    // they act on never. Negative means over, and is not clamped — hiding an
    // overshoot is the one thing a tracker must not do.
    remaining: {
      kcal: target.kcal - totals.kcal,
      protein: toGrams(target.protein_cg - totals.protein_cg),
      carbs: toGrams(target.carbs_cg - totals.carbs_cg),
      fat: toGrams(target.fat_cg - totals.fat_cg),
    },
    logged: rows.length,
  });
});

/* ---- entries ------------------------------------------------------------- */

function readQuantity(raw: unknown): number {
  if (raw == null) return QUANTITY_SCALE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new HTTPException(400, { message: "quantity must be a positive number" });
  }
  const cx = Math.round(n * QUANTITY_SCALE);
  if (cx > MAX_QUANTITY_CX) {
    throw new HTTPException(400, {
      message: `quantity must be ${MAX_QUANTITY_CX / QUANTITY_SCALE} servings or fewer`,
    });
  }
  return cx;
}

interface FoodLookup extends Nutrition {
  id: number;
  name: string;
  serving_label: string;
}

async function findFood(db: D1Database, id: number, userId: number) {
  const food = await db
    .prepare(
      `SELECT id, name, serving_label, kcal, protein_cg, carbs_cg, fat_cg, fibre_cg
         FROM foods WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
    )
    .bind(id, userId)
    .first<FoodLookup>();
  if (!food) throw new HTTPException(404, { message: "Food not found" });
  return food;
}

/**
 * POST /api/meals/entries — log something.
 *
 * Two shapes. With a food_id the nutrition comes from the library and is scaled
 * by the quantity; without one, the caller supplies the numbers directly, which
 * is what makes "some restaurant thing, roughly 600 kcal" loggable without
 * polluting the library with a food nobody will eat again.
 */
meals.post("/entries", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => null)) ?? {};

  const meal = body.meal ?? "snack";
  if (!isMeal(meal)) {
    throw new HTTPException(400, { message: `meal must be one of ${MEALS.join(", ")}` });
  }
  const loggedOn = readDate(body.logged_on, "logged_on");
  const quantityCx = readQuantity(body.quantity);

  let name: string;
  let servingLabel: string;
  let foodId: number | null = null;
  let nutrition: Nutrition;

  if (body.food_id != null) {
    const id = Number(body.food_id);
    if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid food_id" });
    const food = await findFood(c.env.DB, id, user.sub);
    foodId = food.id;
    name = food.name;
    servingLabel = food.serving_label;
    nutrition = scaleNutrition(food, quantityCx);
  } else {
    name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) throw new HTTPException(400, { message: "Give the entry a name, or a food_id" });
    servingLabel = String(body.serving_label ?? "1 serving").trim().slice(0, 40);
    const kcal = Number(body.kcal);
    if (!Number.isFinite(kcal) || kcal < 0) {
      throw new HTTPException(400, { message: "kcal must be a number of zero or more" });
    }
    const g = (key: string) => {
      const n = Number(body[key] ?? 0);
      return Number.isFinite(n) && n >= 0 ? toCg(n) : 0;
    };
    nutrition = scaleNutrition(
      {
        kcal: Math.round(kcal),
        protein_cg: g("protein"),
        carbs_cg: g("carbs"),
        fat_cg: g("fat"),
        fibre_cg: g("fibre"),
      },
      quantityCx,
    );
  }

  const created = await c.env.DB.prepare(
    `INSERT INTO meal_entries (user_id, logged_on, meal, food_id, name, serving_label,
                               quantity_cx, kcal, protein_cg, carbs_cg, fat_cg, fibre_cg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, logged_on, meal, food_id, name, serving_label, quantity_cx,
               kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, created_at`,
  )
    .bind(
      user.sub,
      loggedOn,
      meal,
      foodId,
      name,
      servingLabel,
      quantityCx,
      nutrition.kcal,
      nutrition.protein_cg,
      nutrition.carbs_cg,
      nutrition.fat_cg,
      nutrition.fibre_cg,
    )
    .first<EntryRow>();

  return c.json({ entry: serializeEntry(created!) }, 201);
});

/**
 * PATCH /api/meals/entries/:id — change the portion, or move it to another meal.
 *
 * Changing the quantity rescales from the food it came from, not from the
 * stored totals, so repeated edits do not compound their own rounding. An entry
 * typed in by hand has no food to go back to, so it scales from what is stored —
 * accepted, because the alternative is refusing to edit it at all.
 */
meals.patch("/entries/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const body = (await c.req.json().catch(() => null)) ?? {};

  const entry = await c.env.DB.prepare(
    `SELECT id, logged_on, meal, food_id, name, serving_label, quantity_cx,
            kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, created_at
       FROM meal_entries WHERE id = ? AND user_id = ?`,
  )
    .bind(id, user.sub)
    .first<EntryRow>();
  if (!entry) throw new HTTPException(404, { message: "Entry not found" });

  const meal = body.meal != null ? body.meal : entry.meal;
  if (!isMeal(meal)) {
    throw new HTTPException(400, { message: `meal must be one of ${MEALS.join(", ")}` });
  }
  const loggedOn = body.logged_on != null ? readDate(body.logged_on, "logged_on") : entry.logged_on;

  let nutrition: Nutrition = entry;
  let quantityCx = entry.quantity_cx;

  if (body.quantity != null) {
    quantityCx = readQuantity(body.quantity);
    if (entry.food_id != null) {
      const food = await findFood(c.env.DB, entry.food_id, user.sub);
      nutrition = scaleNutrition(food, quantityCx);
    } else {
      const perServing = scaleNutrition(entry, Math.round((QUANTITY_SCALE * QUANTITY_SCALE) / entry.quantity_cx));
      nutrition = scaleNutrition(perServing, quantityCx);
    }
  }

  const updated = await c.env.DB.prepare(
    `UPDATE meal_entries SET meal = ?, logged_on = ?, quantity_cx = ?, kcal = ?,
            protein_cg = ?, carbs_cg = ?, fat_cg = ?, fibre_cg = ?
      WHERE id = ? AND user_id = ?
      RETURNING id, logged_on, meal, food_id, name, serving_label, quantity_cx,
                kcal, protein_cg, carbs_cg, fat_cg, fibre_cg, created_at`,
  )
    .bind(
      meal,
      loggedOn,
      quantityCx,
      nutrition.kcal,
      nutrition.protein_cg,
      nutrition.carbs_cg,
      nutrition.fat_cg,
      nutrition.fibre_cg,
      id,
      user.sub,
    )
    .first<EntryRow>();

  return c.json({ entry: serializeEntry(updated!) });
});

/** DELETE /api/meals/entries/:id */
meals.delete("/entries/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM meal_entries WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Entry not found" });
  return c.json({ ok: true });
});

/**
 * POST /api/meals/copy — repeat a day, or one meal of it.
 *
 * Most days rhyme with other days. Copying yesterday's breakfast is one tap
 * against six or seven, and it is the single feature most likely to keep a log
 * alive past its second week.
 */
meals.post("/copy", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => null)) ?? {};

  const from = readDate(body.from, "from");
  const to = readDate(body.to, "to");
  const meal = body.meal != null ? body.meal : null;
  if (meal !== null && !isMeal(meal)) {
    throw new HTTPException(400, { message: `meal must be one of ${MEALS.join(", ")}` });
  }
  if (from === to && meal === null) {
    throw new HTTPException(400, { message: "Pick a different day to copy from" });
  }

  const { results } = await c.env.DB.prepare(
    `SELECT meal, food_id, name, serving_label, quantity_cx,
            kcal, protein_cg, carbs_cg, fat_cg, fibre_cg
       FROM meal_entries WHERE user_id = ? AND logged_on = ?
        ${meal ? "AND meal = ?" : ""} ORDER BY id`,
  )
    .bind(...(meal ? [user.sub, from, meal] : [user.sub, from]))
    .all<EntryRow>();

  const rows = results ?? [];
  if (rows.length === 0) {
    throw new HTTPException(404, { message: "Nothing logged on that day to copy" });
  }

  await c.env.DB.batch(
    rows.map((r) =>
      c.env.DB.prepare(
        `INSERT INTO meal_entries (user_id, logged_on, meal, food_id, name, serving_label,
                                   quantity_cx, kcal, protein_cg, carbs_cg, fat_cg, fibre_cg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        user.sub,
        to,
        // Copying one meal into another day keeps its slot; the target meal can
        // be overridden when copying, say, yesterday's lunch into today's dinner.
        body.as_meal != null && isMeal(body.as_meal) ? body.as_meal : r.meal,
        r.food_id,
        r.name,
        r.serving_label,
        r.quantity_cx,
        r.kcal,
        r.protein_cg,
        r.carbs_cg,
        r.fat_cg,
        r.fibre_cg,
      ),
    ),
  );

  return c.json({ copied: rows.length, to }, 201);
});

/* ---- trends -------------------------------------------------------------- */

/**
 * GET /api/meals/trends?days=30
 *
 * Days with nothing logged are absent from the query and filled back in as
 * zeroes below. A line that skips them compresses time and lies about the
 * shape — the same reason the dashboard sparkline fills its gaps.
 */
meals.get("/trends", async (c) => {
  const user = c.get("user");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 30), 7), 180);
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  const { results } = await c.env.DB.prepare(
    `SELECT logged_on AS day, SUM(kcal) AS kcal, SUM(protein_cg) AS protein_cg,
            SUM(carbs_cg) AS carbs_cg, SUM(fat_cg) AS fat_cg
       FROM meal_entries WHERE user_id = ? AND logged_on >= ?
      GROUP BY logged_on ORDER BY logged_on`,
  )
    .bind(user.sub, from)
    .all<{ day: string; kcal: number; protein_cg: number; carbs_cg: number; fat_cg: number }>();

  const byDay = new Map((results ?? []).map((r) => [r.day, r]));
  const series: {
    day: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    logged: boolean;
  }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(day);
    series.push({
      day,
      kcal: row?.kcal ?? 0,
      protein: toGrams(row?.protein_cg ?? 0),
      carbs: toGrams(row?.carbs_cg ?? 0),
      fat: toGrams(row?.fat_cg ?? 0),
      logged: Boolean(row),
    });
  }

  const loggedDays = series.filter((d) => d.logged);
  const targets = await loadTargets(c.env.DB, user.sub);
  const target = targets ?? DEFAULT_TARGETS;

  /*
    The streak counts back from today, and today not being logged yet does not
    break it — at 9am nothing is logged and a streak that reads zero every
    morning is a punishment for waking up.
  */
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].logged) streak++;
    else if (i !== series.length - 1) break;
  }

  return c.json({
    days,
    series,
    // Averaged over days actually logged, not calendar days: dividing a week's
    // food by seven when four were recorded invents a diet nobody was on.
    average: {
      kcal: loggedDays.length
        ? Math.round(loggedDays.reduce((s, d) => s + d.kcal, 0) / loggedDays.length)
        : 0,
      protein: loggedDays.length
        ? Math.round(loggedDays.reduce((s, d) => s + d.protein, 0) / loggedDays.length)
        : 0,
    },
    logged_days: loggedDays.length,
    streak,
    target: { kcal: target.kcal, protein: toGrams(target.protein_cg) },
    on_target_days: loggedDays.filter((d) => d.kcal <= target.kcal).length,
  });
});

/* ---- targets ------------------------------------------------------------- */

meals.get("/targets", async (c) => {
  const user = c.get("user");
  const row = await loadTargets(c.env.DB, user.sub);
  if (!row) {
    return c.json({
      targets: { ...DEFAULT_TARGETS, protein: toGrams(DEFAULT_TARGETS.protein_cg) },
      configured: false,
      profile: null,
    });
  }
  return c.json({
    targets: {
      kcal: row.kcal,
      protein: toGrams(row.protein_cg),
      carbs: toGrams(row.carbs_cg),
      fat: toGrams(row.fat_cg),
    },
    configured: true,
    profile: row.sex
      ? {
          sex: row.sex,
          age: row.age,
          height_cm: row.height_cm,
          weight_kg: row.weight_g != null ? row.weight_g / 1000 : null,
          activity: row.activity,
          goal: row.goal,
        }
      : null,
  });
});

const ACTIVITIES = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS = ["lose", "maintain", "gain"];

/**
 * PUT /api/meals/targets — set them directly, or derive them from a profile.
 *
 * Both are supported because both are real. Someone who has been given numbers
 * by a dietitian wants to type those in; someone starting from nothing wants to
 * be asked five questions and handed a starting point.
 */
meals.put("/targets", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => null)) ?? {};

  let targets: { kcal: number; protein_cg: number; carbs_cg: number; fat_cg: number };
  let profile: {
    sex: Sex;
    age: number;
    height_cm: number;
    weight_g: number;
    activity: Activity;
    goal: Goal;
  } | null = null;

  if (body.profile) {
    const p = body.profile;
    const sex = p.sex === "female" ? "female" : p.sex === "male" ? "male" : null;
    const age = Number(p.age);
    const height = Number(p.height_cm);
    const weight = Number(p.weight_kg);
    const activity = String(p.activity ?? "");
    const goal = String(p.goal ?? "");

    if (!sex) throw new HTTPException(400, { message: "sex must be male or female" });
    if (!Number.isFinite(age) || age < 13 || age > 100) {
      throw new HTTPException(400, { message: "age must be between 13 and 100" });
    }
    if (!Number.isFinite(height) || height < 100 || height > 250) {
      throw new HTTPException(400, { message: "height_cm must be between 100 and 250" });
    }
    if (!Number.isFinite(weight) || weight < 25 || weight > 300) {
      throw new HTTPException(400, { message: "weight_kg must be between 25 and 300" });
    }
    if (!ACTIVITIES.includes(activity)) {
      throw new HTTPException(400, { message: `activity must be one of ${ACTIVITIES.join(", ")}` });
    }
    if (!GOALS.includes(goal)) {
      throw new HTTPException(400, { message: `goal must be one of ${GOALS.join(", ")}` });
    }

    profile = {
      sex,
      age: Math.round(age),
      height_cm: Math.round(height),
      weight_g: Math.round(weight * 1000),
      activity: activity as Activity,
      goal: goal as Goal,
    };
    targets = deriveTargets(profile);
  } else {
    const kcal = Number(body.kcal);
    if (!Number.isFinite(kcal) || kcal < 800 || kcal > 8000) {
      throw new HTTPException(400, { message: "kcal must be between 800 and 8000" });
    }
    const macro = (key: string, fallback: number) => {
      const n = Number(body[key]);
      return Number.isFinite(n) && n >= 0 ? toCg(n) : fallback;
    };
    targets = {
      kcal: Math.round(kcal),
      protein_cg: macro("protein", DEFAULT_TARGETS.protein_cg),
      carbs_cg: macro("carbs", DEFAULT_TARGETS.carbs_cg),
      fat_cg: macro("fat", DEFAULT_TARGETS.fat_cg),
    };
  }

  await c.env.DB.prepare(
    `INSERT INTO nutrition_targets (user_id, kcal, protein_cg, carbs_cg, fat_cg,
                                    sex, age, height_cm, weight_g, activity, goal, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       kcal = excluded.kcal, protein_cg = excluded.protein_cg,
       carbs_cg = excluded.carbs_cg, fat_cg = excluded.fat_cg,
       sex = excluded.sex, age = excluded.age, height_cm = excluded.height_cm,
       weight_g = excluded.weight_g, activity = excluded.activity,
       goal = excluded.goal, updated_at = datetime('now')`,
  )
    .bind(
      user.sub,
      targets.kcal,
      targets.protein_cg,
      targets.carbs_cg,
      targets.fat_cg,
      profile?.sex ?? null,
      profile?.age ?? null,
      profile?.height_cm ?? null,
      profile?.weight_g ?? null,
      profile?.activity ?? null,
      profile?.goal ?? null,
    )
    .run();

  return c.json({
    targets: {
      kcal: targets.kcal,
      protein: toGrams(targets.protein_cg),
      carbs: toGrams(targets.carbs_cg),
      fat: toGrams(targets.fat_cg),
    },
    derived: profile !== null,
  });
});

/* ---- weight -------------------------------------------------------------- */

/** GET /api/meals/weight?days=90 — readings plus the change over the window. */
meals.get("/weight", async (c) => {
  const user = c.get("user");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 90), 7), 730);
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  const { results } = await c.env.DB.prepare(
    `SELECT id, logged_on, grams FROM weight_log
      WHERE user_id = ? AND logged_on >= ? ORDER BY logged_on`,
  )
    .bind(user.sub, from)
    .all<{ id: number; logged_on: string; grams: number }>();

  const rows = results ?? [];
  const readings = rows.map((r) => ({ id: r.id, day: r.logged_on, kg: r.grams / 1000 }));

  return c.json({
    readings,
    latest: readings.length ? readings[readings.length - 1] : null,
    change_kg: readings.length > 1 ? readings[readings.length - 1].kg - readings[0].kg : null,
  });
});

/** POST /api/meals/weight — one reading per day; a second replaces the first. */
meals.post("/weight", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => null)) ?? {};

  const kg = Number(body.kg);
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) {
    throw new HTTPException(400, { message: "kg must be between 20 and 400" });
  }
  const loggedOn = readDate(body.logged_on, "logged_on");

  await c.env.DB.prepare(
    `INSERT INTO weight_log (user_id, logged_on, grams) VALUES (?, ?, ?)
     ON CONFLICT(user_id, logged_on) DO UPDATE SET grams = excluded.grams`,
  )
    .bind(user.sub, loggedOn, Math.round(kg * 1000))
    .run();

  return c.json({ day: loggedOn, kg }, 201);
});

/* ---- templates ----------------------------------------------------------- */

/** GET /api/meals/templates — saved combinations, with what each adds up to. */
meals.get("/templates", async (c) => {
  const user = c.get("user");

  const { results: templates } = await c.env.DB.prepare(
    "SELECT id, name, meal FROM meal_templates WHERE user_id = ? ORDER BY meal, name",
  )
    .bind(user.sub)
    .all<{ id: number; name: string; meal: string }>();

  const list = templates ?? [];
  if (list.length === 0) return c.json({ templates: [] });

  const { results: items } = await c.env.DB.prepare(
    `SELECT i.template_id, i.quantity_cx, f.id AS food_id, f.name,
            f.serving_label, f.kcal, f.protein_cg, f.carbs_cg, f.fat_cg, f.fibre_cg
       FROM meal_template_items i
       JOIN meal_templates t ON t.id = i.template_id
       JOIN foods f ON f.id = i.food_id
      WHERE t.user_id = ?`,
  )
    .bind(user.sub)
    .all<
      {
        template_id: number;
        quantity_cx: number;
        food_id: number;
        name: string;
        serving_label: string;
      } & Nutrition
    >();

  const byTemplate = new Map<number, typeof items>();
  for (const item of items ?? []) {
    const list = byTemplate.get(item.template_id) ?? [];
    list.push(item);
    byTemplate.set(item.template_id, list);
  }

  return c.json({
    templates: list.map((t) => {
      const own = byTemplate.get(t.id) ?? [];
      const scaled = own.map((i) => scaleNutrition(i, i.quantity_cx));
      return {
        ...t,
        items: own.map((i) => ({
          food_id: i.food_id,
          name: i.name,
          serving_label: i.serving_label,
          quantity: i.quantity_cx / QUANTITY_SCALE,
        })),
        totals: nutritionOut(sumNutrition(scaled)),
      };
    }),
  });
});

const MAX_TEMPLATE_ITEMS = 20;

/** POST /api/meals/templates — save the combination currently being eaten. */
meals.post("/templates", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => null)) ?? {};

  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) throw new HTTPException(400, { message: "Give the template a name" });
  const meal = body.meal ?? "breakfast";
  if (!isMeal(meal)) {
    throw new HTTPException(400, { message: `meal must be one of ${MEALS.join(", ")}` });
  }

  const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) throw new HTTPException(400, { message: "Add at least one food" });
  if (rawItems.length > MAX_TEMPLATE_ITEMS) {
    throw new HTTPException(400, { message: `A template holds at most ${MAX_TEMPLATE_ITEMS} foods` });
  }

  const items = rawItems.map((entry) => {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const foodId = Number(raw.food_id);
    if (!Number.isInteger(foodId)) throw new HTTPException(400, { message: "Invalid food_id" });
    return { foodId, quantityCx: readQuantity(raw.quantity) };
  });

  // Every food must be one this account can see, or the template would log
  // somebody else's row on every use.
  for (const item of items) await findFood(c.env.DB, item.foodId, user.sub);

  const template = await c.env.DB.prepare(
    "INSERT INTO meal_templates (user_id, name, meal) VALUES (?, ?, ?) RETURNING id, name, meal",
  )
    .bind(user.sub, name, meal)
    .first<{ id: number; name: string; meal: string }>();

  await c.env.DB.batch(
    items.map((i) =>
      c.env.DB.prepare(
        "INSERT INTO meal_template_items (template_id, food_id, quantity_cx) VALUES (?, ?, ?)",
      ).bind(template!.id, i.foodId, i.quantityCx),
    ),
  );

  return c.json({ template }, 201);
});

/** POST /api/meals/templates/:id/log — the one-tap payoff. */
meals.post("/templates/:id/log", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const body = (await c.req.json().catch(() => ({}))) ?? {};

  const template = await c.env.DB.prepare(
    "SELECT id, name, meal FROM meal_templates WHERE id = ? AND user_id = ?",
  )
    .bind(id, user.sub)
    .first<{ id: number; name: string; meal: string }>();
  if (!template) throw new HTTPException(404, { message: "Template not found" });

  const meal = body.meal != null && isMeal(body.meal) ? body.meal : template.meal;
  const loggedOn = readDate(body.logged_on, "logged_on");

  const { results } = await c.env.DB.prepare(
    `SELECT i.quantity_cx, f.id AS food_id, f.name, f.serving_label,
            f.kcal, f.protein_cg, f.carbs_cg, f.fat_cg, f.fibre_cg
       FROM meal_template_items i JOIN foods f ON f.id = i.food_id
      WHERE i.template_id = ?`,
  )
    .bind(id)
    .all<{ quantity_cx: number; food_id: number; name: string; serving_label: string } & Nutrition>();

  const items = results ?? [];
  if (items.length === 0) throw new HTTPException(400, { message: "That template has no foods" });

  await c.env.DB.batch(
    items.map((i) => {
      const n = scaleNutrition(i, i.quantity_cx);
      return c.env.DB.prepare(
        `INSERT INTO meal_entries (user_id, logged_on, meal, food_id, name, serving_label,
                                   quantity_cx, kcal, protein_cg, carbs_cg, fat_cg, fibre_cg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        user.sub,
        loggedOn,
        meal,
        i.food_id,
        i.name,
        i.serving_label,
        i.quantity_cx,
        n.kcal,
        n.protein_cg,
        n.carbs_cg,
        n.fat_cg,
        n.fibre_cg,
      );
    }),
  );

  return c.json({ logged: items.length, meal, date: loggedOn }, 201);
});

/** DELETE /api/meals/templates/:id — items go with it (FK cascade). */
meals.delete("/templates/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const res = await c.env.DB.prepare("DELETE FROM meal_templates WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Template not found" });
  return c.json({ ok: true });
});

export default meals;
