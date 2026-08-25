/*
  Meals and the food library, through the real Hono apps against real SQLite —
  including the seeded built-ins, since the migration is where they come from.

  The property that carries the module is that a logged entry is a snapshot.
  Correcting a food next month must not rewrite what last month says you ate,
  and the only way to be sure is to correct one and go back and look.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import mealRoutes from "./meals";
import foodRoutes from "./foods";
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
  app.route("/api/meals", mealRoutes as Hono<AppBindings, any, any>);
  app.route("/api/foods", foodRoutes as Hono<AppBindings, any, any>);

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

const json = async (res: Response) => (await res.json()) as any;
const today = () => new Date().toISOString().slice(0, 10);
const shiftDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** The seeded id for a built-in, looked up by name. */
function foodId(name: string): number {
  const row = t.raw.prepare("SELECT id FROM foods WHERE name = ? AND user_id IS NULL").get(name) as
    | { id: number }
    | undefined;
  if (!row) throw new Error(`no seeded food called ${name}`);
  return row.id;
}

beforeEach(async () => {
  t = createTestDb();
  t.raw
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, email_verified) VALUES
         (1, 'me@x.co', 'Me', 'x', 1), (2, 'them@x.co', 'Them', 'x', 1)`,
    )
    .run();
  mine = await signToken({ id: 1, email: "me@x.co", name: "Me" }, JWT_SECRET);
  theirs = await signToken({ id: 2, email: "them@x.co", name: "Them" }, JWT_SECRET);
});

afterEach(() => t.close());

describe("the seeded library", () => {
  it("ships enough food to be usable on day one", () => {
    const { n } = t.raw.prepare("SELECT COUNT(*) AS n FROM foods WHERE user_id IS NULL").get() as {
      n: number;
    };
    expect(n).toBeGreaterThan(120);
  });

  it("measures in household portions, not grams", async () => {
    const { foods } = await json(await call("/api/foods?q=idli", mine));
    expect(foods[0].serving_label).toBe("1 idli");
  });

  it("has no food claiming impossible macros", () => {
    /*
      A serving cannot contain more energy than its macros can account for.
      Catches a transposed column or a misplaced decimal in the seed, which is
      otherwise invisible until someone's day looks wrong.
    */
    const rows = t.raw
      .prepare(
        // Alcohol is excluded, and that is the reason it has its own category:
        // its energy is ethanol at 7 kcal/g, which is not protein, carbs or
        // fat, so a macro-accounting check cannot say anything about it.
        "SELECT name, kcal, protein_cg, carbs_cg, fat_cg FROM foods WHERE user_id IS NULL AND category <> 'alcohol'",
      )
      .all() as { name: string; kcal: number; protein_cg: number; carbs_cg: number; fat_cg: number }[];

    for (const r of rows) {
      const fromMacros =
        (r.protein_cg / 100) * 4 + (r.carbs_cg / 100) * 4 + (r.fat_cg / 100) * 9;
      if (r.kcal === 0) continue;
      // Generous: fibre, alcohol and rounding all live in the gap.
      expect(Math.abs(fromMacros - r.kcal), r.name).toBeLessThan(r.kcal * 0.45 + 30);
    }
  });
});

describe("searching foods", () => {
  it("leads with what starts with the term", async () => {
    const { foods } = await json(await call("/api/foods?q=dal", mine));
    expect(foods[0].name.toLowerCase().startsWith("dal")).toBe(true);
  });

  it("treats a wildcard as text, not as a wildcard", async () => {
    const { foods } = await json(await call("/api/foods?q=%25", mine));
    expect(foods).toHaveLength(0);
  });

  it("finds nothing for a food nobody has", async () => {
    const { foods } = await json(await call("/api/foods?q=zzzznotafood", mine));
    expect(foods).toHaveLength(0);
  });
});

describe("logging", () => {
  it("scales the library's numbers by the portion", async () => {
    const res = await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Idli"),
      meal: "breakfast",
      quantity: 3,
    });
    expect(res.status).toBe(201);
    const { entry } = await json(res);
    expect(entry.kcal).toBe(58 * 3);
    expect(entry.protein).toBeCloseTo(4.8, 2);
    expect(entry.name).toBe("Idli");
  });

  it("accepts a one-off with its own numbers and no library entry", async () => {
    const res = await call("/api/meals/entries", mine, "POST", {
      name: "Wedding lunch",
      kcal: 900,
      protein: 30,
      meal: "lunch",
    });
    expect(res.status).toBe(201);
    const { entry } = await json(res);
    expect(entry.kcal).toBe(900);
    expect(entry.food_id).toBeNull();
    // And it did not quietly become a library food.
    const { n } = t.raw.prepare("SELECT COUNT(*) AS n FROM foods WHERE user_id = 1").get() as {
      n: number;
    };
    expect(n).toBe(0);
  });

  it("refuses a meal section no screen renders", async () => {
    const res = await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Idli"),
      meal: "brunch",
    });
    expect(res.status).toBe(400);
  });

  it("refuses an absurd portion rather than poisoning the day's total", async () => {
    const res = await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Idli"),
      meal: "breakfast",
      quantity: 500,
    });
    expect(res.status).toBe(400);
  });

  it("cannot log another account's private food", async () => {
    const created = await json(
      await call("/api/foods", theirs, "POST", { name: "Secret protein", kcal: 200 }),
    );
    const res = await call("/api/meals/entries", mine, "POST", {
      food_id: created.food.id,
      meal: "lunch",
    });
    expect(res.status).toBe(404);
  });
});

describe("the day view", () => {
  it("returns every meal section even when the day is empty", async () => {
    const day = await json(await call("/api/meals/day", mine));
    expect(day.meals.map((m: any) => m.meal)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ]);
    expect(day.totals.kcal).toBe(0);
  });

  it("subtotals each meal and totals the day", async () => {
    await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Idli"),
      meal: "breakfast",
      quantity: 2,
    });
    await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Steamed rice"),
      meal: "lunch",
    });

    const day = await json(await call("/api/meals/day", mine));
    const breakfast = day.meals.find((m: any) => m.meal === "breakfast");
    expect(breakfast.totals.kcal).toBe(116);
    expect(day.totals.kcal).toBe(116 + 195);
  });

  it("reports what is left, and lets it go negative", async () => {
    await call("/api/meals/targets", mine, "PUT", { kcal: 800, protein: 40 });
    for (const meal of ["lunch", "dinner"]) {
      await call("/api/meals/entries", mine, "POST", {
        food_id: foodId("Mutton biryani"),
        meal,
      });
    }

    const day = await json(await call("/api/meals/day", mine));
    // Hiding an overshoot behind a zero is the one thing a tracker must not do.
    expect(day.remaining.kcal).toBeLessThan(0);
  });

  it("shows one day without leaking the next", async () => {
    await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Idli"),
      meal: "breakfast",
      logged_on: shiftDays(-1),
    });
    const day = await json(await call("/api/meals/day", mine));
    expect(day.totals.kcal).toBe(0);
    const yesterday = await json(await call(`/api/meals/day?date=${shiftDays(-1)}`, mine));
    expect(yesterday.totals.kcal).toBe(58);
  });

  it("never shows another account's food", async () => {
    await call("/api/meals/entries", theirs, "POST", {
      food_id: foodId("Mutton biryani"),
      meal: "lunch",
    });
    const day = await json(await call("/api/meals/day", mine));
    expect(day.totals.kcal).toBe(0);
  });

  it("rejects a date that is not a date", async () => {
    expect((await call("/api/meals/day?date=yesterday", mine)).status).toBe(400);
  });
});

describe("editing an entry", () => {
  it("rescales from the food, not from the rounded total", async () => {
    const { entry } = await json(
      await call("/api/meals/entries", mine, "POST", {
        food_id: foodId("Idli"),
        meal: "breakfast",
        quantity: 3,
      }),
    );

    // Down to one and back to three: a rescale that compounded its own rounding
    // would not land back on the original number.
    await call(`/api/meals/entries/${entry.id}`, mine, "PATCH", { quantity: 1 });
    const back = await json(
      await call(`/api/meals/entries/${entry.id}`, mine, "PATCH", { quantity: 3 }),
    );
    expect(back.entry.kcal).toBe(58 * 3);
  });

  it("moves an entry between meals", async () => {
    const { entry } = await json(
      await call("/api/meals/entries", mine, "POST", {
        food_id: foodId("Samosa"),
        meal: "snack",
      }),
    );
    await call(`/api/meals/entries/${entry.id}`, mine, "PATCH", { meal: "lunch" });
    const day = await json(await call("/api/meals/day", mine));
    expect(day.meals.find((m: any) => m.meal === "lunch").entries).toHaveLength(1);
    expect(day.meals.find((m: any) => m.meal === "snack").entries).toHaveLength(0);
  });

  it("cannot touch another account's entry", async () => {
    const { entry } = await json(
      await call("/api/meals/entries", theirs, "POST", { name: "Theirs", kcal: 100 }),
    );
    expect((await call(`/api/meals/entries/${entry.id}`, mine, "PATCH", { quantity: 2 })).status).toBe(404);
    expect((await call(`/api/meals/entries/${entry.id}`, mine, "DELETE")).status).toBe(404);
  });
});

describe("correcting a food", () => {
  it("copies a built-in instead of changing it for everyone", async () => {
    const id = foodId("Idli");
    const res = await json(await call(`/api/foods/${id}`, mine, "PATCH", { kcal: 70 }));
    expect(res.copied).toBe(true);
    expect(res.food.kcal).toBe(70);

    // The shared row is untouched, so nobody else's breakfast moved.
    const builtin = t.raw.prepare("SELECT kcal FROM foods WHERE id = ?").get(id) as { kcal: number };
    expect(builtin.kcal).toBe(58);
    const { foods } = await json(await call("/api/foods?q=idli", theirs));
    expect(foods.find((f: any) => f.name === "Idli").kcal).toBe(58);
  });

  it("shows the copy instead of the original, not both", async () => {
    await call(`/api/foods/${foodId("Idli")}`, mine, "PATCH", { kcal: 70 });
    const { foods } = await json(await call("/api/foods?q=idli", mine));
    const idlis = foods.filter((f: any) => f.name === "Idli");
    expect(idlis).toHaveLength(1);
    expect(idlis[0].kcal).toBe(70);
  });

  it("does not rewrite what was already logged", async () => {
    await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Idli"),
      meal: "breakfast",
      quantity: 2,
    });
    await call(`/api/foods/${foodId("Idli")}`, mine, "PATCH", { kcal: 200 });

    // The whole reason entries carry their own numbers.
    const day = await json(await call("/api/meals/day", mine));
    expect(day.totals.kcal).toBe(116);
  });

  it("refuses to delete a built-in, and says what to do instead", async () => {
    const res = await call(`/api/foods/${foodId("Idli")}`, mine, "DELETE");
    expect(res.status).toBe(404);
    expect((await json(res)).error).toContain("edited");
  });
});

describe("copying a day", () => {
  it("repeats yesterday", async () => {
    for (const food of ["Idli", "Filter coffee"]) {
      await call("/api/meals/entries", mine, "POST", {
        food_id: foodId(food),
        meal: "breakfast",
        logged_on: shiftDays(-1),
      });
    }

    const res = await call("/api/meals/copy", mine, "POST", {
      from: shiftDays(-1),
      to: today(),
      meal: "breakfast",
    });
    expect(res.status).toBe(201);

    const day = await json(await call("/api/meals/day", mine));
    expect(day.meals.find((m: any) => m.meal === "breakfast").entries).toHaveLength(2);
  });

  it("can land in a different meal than it came from", async () => {
    await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Steamed rice"),
      meal: "lunch",
      logged_on: shiftDays(-1),
    });
    await call("/api/meals/copy", mine, "POST", {
      from: shiftDays(-1),
      to: today(),
      meal: "lunch",
      as_meal: "dinner",
    });
    const day = await json(await call("/api/meals/day", mine));
    expect(day.meals.find((m: any) => m.meal === "dinner").entries).toHaveLength(1);
  });

  it("says so when there is nothing to copy", async () => {
    const res = await call("/api/meals/copy", mine, "POST", {
      from: shiftDays(-5),
      to: today(),
    });
    expect(res.status).toBe(404);
  });
});

describe("templates", () => {
  async function usualBreakfast() {
    return json(
      await call("/api/meals/templates", mine, "POST", {
        name: "Usual breakfast",
        meal: "breakfast",
        items: [
          { food_id: foodId("Idli"), quantity: 3 },
          { food_id: foodId("Sambar"), quantity: 1 },
          { food_id: foodId("Filter coffee"), quantity: 1 },
        ],
      }),
    );
  }

  it("saves a combination and totals it", async () => {
    await usualBreakfast();
    const { templates } = await json(await call("/api/meals/templates", mine));
    expect(templates).toHaveLength(1);
    expect(templates[0].items).toHaveLength(3);
    expect(templates[0].totals.kcal).toBe(58 * 3 + 105 + 90);
  });

  it("logs the whole thing in one call", async () => {
    const { template } = await usualBreakfast();
    const res = await call(`/api/meals/templates/${template.id}/log`, mine, "POST", {});
    expect(res.status).toBe(201);

    const day = await json(await call("/api/meals/day", mine));
    expect(day.meals.find((m: any) => m.meal === "breakfast").entries).toHaveLength(3);
    expect(day.totals.kcal).toBe(58 * 3 + 105 + 90);
  });

  it("refuses a template built on someone else's food", async () => {
    const theirFood = await json(
      await call("/api/foods", theirs, "POST", { name: "Their shake", kcal: 300 }),
    );
    const res = await call("/api/meals/templates", mine, "POST", {
      name: "Sneaky",
      items: [{ food_id: theirFood.food.id }],
    });
    expect(res.status).toBe(404);
  });

  it("cannot be logged by another account", async () => {
    const { template } = await usualBreakfast();
    expect((await call(`/api/meals/templates/${template.id}/log`, theirs, "POST", {})).status).toBe(404);
  });
});

describe("targets", () => {
  it("hands out a sane default before anything is configured", async () => {
    const res = await json(await call("/api/meals/targets", mine));
    expect(res.configured).toBe(false);
    expect(res.targets.kcal).toBeGreaterThan(1500);
  });

  it("accepts numbers typed in directly", async () => {
    await call("/api/meals/targets", mine, "PUT", { kcal: 2200, protein: 140 });
    const res = await json(await call("/api/meals/targets", mine));
    expect(res.targets.kcal).toBe(2200);
    expect(res.targets.protein).toBe(140);
    expect(res.configured).toBe(true);
  });

  it("derives them from a profile", async () => {
    const res = await json(
      await call("/api/meals/targets", mine, "PUT", {
        profile: {
          sex: "male",
          age: 30,
          height_cm: 175,
          weight_kg: 75,
          activity: "moderate",
          goal: "lose",
        },
      }),
    );
    expect(res.derived).toBe(true);
    expect(res.targets.kcal).toBeGreaterThan(1200);
    expect(res.targets.protein).toBeGreaterThan(100);
  });

  it("remembers the profile so the numbers can be recomputed later", async () => {
    await call("/api/meals/targets", mine, "PUT", {
      profile: {
        sex: "female",
        age: 28,
        height_cm: 162,
        weight_kg: 58,
        activity: "light",
        goal: "maintain",
      },
    });
    const res = await json(await call("/api/meals/targets", mine));
    expect(res.profile.weight_kg).toBe(58);
    expect(res.profile.goal).toBe("maintain");
  });

  it("refuses a target nobody should be eating to", async () => {
    // 100 kcal is not a diet, it is a typo. Caught here rather than becoming a
    // ring that reads -2400 every day.
    expect((await call("/api/meals/targets", mine, "PUT", { kcal: 100 })).status).toBe(400);
    expect((await call("/api/meals/targets", mine, "PUT", { kcal: 90000 })).status).toBe(400);
  });

  it("rejects a profile that is not a person", async () => {
    for (const profile of [
      { sex: "male", age: 4, height_cm: 175, weight_kg: 75, activity: "moderate", goal: "lose" },
      { sex: "male", age: 30, height_cm: 400, weight_kg: 75, activity: "moderate", goal: "lose" },
      { sex: "cat", age: 30, height_cm: 175, weight_kg: 75, activity: "moderate", goal: "lose" },
    ]) {
      expect((await call("/api/meals/targets", mine, "PUT", { profile })).status).toBe(400);
    }
  });

  it("is per account", async () => {
    await call("/api/meals/targets", mine, "PUT", { kcal: 2200 });
    const res = await json(await call("/api/meals/targets", theirs));
    expect(res.configured).toBe(false);
  });
});

describe("weight", () => {
  it("keeps one reading per day, the latest winning", async () => {
    await call("/api/meals/weight", mine, "POST", { kg: 75.4 });
    await call("/api/meals/weight", mine, "POST", { kg: 75.1 });
    const res = await json(await call("/api/meals/weight", mine));
    expect(res.readings).toHaveLength(1);
    expect(res.latest.kg).toBe(75.1);
  });

  it("reports the change across the window", async () => {
    await call("/api/meals/weight", mine, "POST", { kg: 78, logged_on: shiftDays(-30) });
    await call("/api/meals/weight", mine, "POST", { kg: 76, logged_on: today() });
    const res = await json(await call("/api/meals/weight", mine));
    expect(res.change_kg).toBeCloseTo(-2, 1);
  });

  it("rejects a weight that is not a person's", async () => {
    expect((await call("/api/meals/weight", mine, "POST", { kg: 5 })).status).toBe(400);
    expect((await call("/api/meals/weight", mine, "POST", { kg: 900 })).status).toBe(400);
  });
});

describe("trends", () => {
  it("fills days with nothing logged rather than skipping them", async () => {
    await call("/api/meals/entries", mine, "POST", {
      food_id: foodId("Idli"),
      meal: "breakfast",
      logged_on: shiftDays(-3),
    });
    const res = await json(await call("/api/meals/trends?days=7", mine));
    // A line that skips empty days compresses time and lies about the shape.
    expect(res.series).toHaveLength(7);
    expect(res.series.filter((d: any) => d.logged)).toHaveLength(1);
  });

  it("averages over days actually logged, not calendar days", async () => {
    await call("/api/meals/entries", mine, "POST", {
      name: "Big day",
      kcal: 2000,
      meal: "lunch",
      logged_on: shiftDays(-1),
    });
    const res = await json(await call("/api/meals/trends?days=30", mine));
    // Dividing by 30 would invent a diet nobody was on.
    expect(res.average.kcal).toBe(2000);
    expect(res.logged_days).toBe(1);
  });

  it("does not break the streak just because today is not logged yet", async () => {
    await call("/api/meals/entries", mine, "POST", {
      name: "Yesterday",
      kcal: 500,
      meal: "lunch",
      logged_on: shiftDays(-1),
    });
    const res = await json(await call("/api/meals/trends?days=7", mine));
    // At 9am nothing is logged, and a streak that reads zero every morning is a
    // punishment for waking up.
    expect(res.streak).toBe(1);
  });
});
