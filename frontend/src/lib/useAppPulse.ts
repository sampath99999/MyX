import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/*
  The handful of numbers the navigation needs to be worth opening.

  A menu that only routes has to be read every time; a menu that says "three
  tasks due, a bill on Friday" answers the question you opened it to ask. These
  are the numbers behind that, and they come from the same endpoint the
  dashboard already uses, so nothing new was needed on the server.

  Module-level cache, deliberately. The bar mounts once per session but the
  dashboard fetches the same summary on its own, and two identical requests
  racing on first paint is a waste of a phone's radio. Thirty seconds is long
  enough to cover that overlap and short enough that a task ticked off shows up
  in the menu on the next navigation.

  Failure is silent and total: the badges simply do not appear. Navigation is
  not allowed to depend on this, so a dead endpoint costs an ornament rather
  than the ability to move around the app.
*/

export interface AppPulse {
  balance: number;
  monthSpend: number;
  openTasks: number;
  notes: number;
  checklists: number;
  /** Tasks due today or already overdue. */
  dueToday: number;
  /** The nearest bill, if one falls inside the next week. */
  nextBill: { name: string; amount: number; next_due: string } | null;
}

const TTL_MS = 30_000;

let cache: { at: number; value: AppPulse } | null = null;
let inFlight: Promise<AppPulse | null> | null = null;

async function load(): Promise<AppPulse | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (inFlight) return inFlight;

  inFlight = api
    .dashboardSummary()
    .then((res) => {
      const value: AppPulse = {
        balance: res.stats.balance,
        monthSpend: res.stats.monthSpend,
        openTasks: res.stats.openTasks,
        notes: res.stats.notes,
        checklists: res.stats.checklists,
        dueToday: res.today.tasks.length,
        nextBill: res.today.bills[0] ?? null,
      };
      cache = { at: Date.now(), value };
      return value;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Clears the cache so the next read is fresh — call after a write. */
export function invalidatePulse() {
  cache = null;
}

export function useAppPulse(): AppPulse | null {
  const [pulse, setPulse] = useState<AppPulse | null>(cache?.value ?? null);

  useEffect(() => {
    let active = true;
    /*
      Deferred past first paint. This is decoration on the navigation, and it
      has no business competing with the request for the screen the user is
      actually looking at.
    */
    const id = setTimeout(() => {
      load().then((v) => {
        if (active && v) setPulse(v);
      });
    }, 1200);

    return () => {
      active = false;
      clearTimeout(id);
    };
  }, []);

  return pulse;
}
