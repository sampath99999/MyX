/*
  Recovery when a route chunk cannot be fetched.

  This is the code path behind a real production report: "Failed to fetch
  dynamically imported module: /assets/Project-BSP9RnHG.js". A tab opened
  before a deploy holds the chunk names from the build that loaded it, and
  clicking into a not-yet-fetched route asks for a filename the server may no
  longer have.

  The behaviour worth pinning down is the guard. Reloading on a failed import
  fixes the common case, and reloading *again* on the next failure would turn a
  missing asset into a boot loop — an infinitely worse bug than the one being
  fixed, and one that would make the app unusable rather than one screen
  unavailable.
*/

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadWithRetry } from "./lazyWithRetry";

let reloads = 0;
let store: Record<string, string>;

beforeEach(() => {
  reloads = 0;
  store = {};
  // The module reads both off the global at call time, and the test
  // environment is plain node.
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  vi.stubGlobal("window", { location: { reload: () => { reloads += 1; } } });
});

/** Resolves to "pending" if the promise has not settled — the reload path. */
const settledOr = <T,>(p: Promise<T>, ms = 30) =>
  Promise.race([p.then(() => "resolved").catch(() => "rejected"), new Promise((r) => setTimeout(() => r("pending"), ms))]);

describe("loadWithRetry", () => {
  it("returns the module when the import works", async () => {
    const mod = await loadWithRetry(async () => ({ default: "page" }), 0);
    expect(mod).toEqual({ default: "page" });
    expect(reloads).toBe(0);
  });

  it("retries once before giving up, which covers a network blip", async () => {
    let calls = 0;
    const mod = await loadWithRetry(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch dynamically imported module");
      return { default: "page" };
    }, 0);

    expect(calls).toBe(2);
    expect(mod).toEqual({ default: "page" });
    // A blip must not cost the user their page state.
    expect(reloads).toBe(0);
  });

  it("reloads once when both attempts fail", async () => {
    const fail = () => Promise.reject(new TypeError("Failed to fetch"));
    const outcome = await settledOr(loadWithRetry(fail, 0));

    expect(reloads).toBe(1);
    expect(store["myx.chunk-reloaded"]).toBe("1");
    // It must not resolve: React would render a component into a document that
    // is already being replaced.
    expect(outcome).toBe("pending");
  });

  it("does not reload a second time — a missing asset must not loop", async () => {
    const fail = () => Promise.reject(new TypeError("Failed to fetch"));
    await settledOr(loadWithRetry(fail, 0));
    expect(reloads).toBe(1);

    // The reload happened and the chunk is still gone. This is the boot loop
    // the flag exists to prevent; the error goes to the boundary instead.
    await expect(loadWithRetry(fail, 0)).rejects.toThrow("Failed to fetch");
    expect(reloads).toBe(1);
  });

  it("clears the guard after a success, so a later deploy can recover too", async () => {
    const fail = () => Promise.reject(new TypeError("Failed to fetch"));
    await settledOr(loadWithRetry(fail, 0));
    expect(store["myx.chunk-reloaded"]).toBe("1");

    await loadWithRetry(async () => ({ default: "page" }), 0);
    expect(store["myx.chunk-reloaded"]).toBeUndefined();

    // Second deploy, same session: the recovery is available again.
    await settledOr(loadWithRetry(fail, 0));
    expect(reloads).toBe(2);
  });

  it("survives storage being unavailable", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("private mode");
      },
      removeItem: () => {
        throw new Error("private mode");
      },
    });

    // Safari private mode throws on every storage call. The import must still
    // be attempted and still succeed rather than dying on the bookkeeping.
    const mod = await loadWithRetry(async () => ({ default: "page" }), 0);
    expect(mod).toEqual({ default: "page" });
  });
});
