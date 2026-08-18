import { describe, it, expect } from "vitest";
import { chunk, ENRICH_CHUNK_SIZE } from "./tasks";

describe("chunk", () => {
  it("splits evenly when the size divides the length", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("puts the remainder in a final short batch", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("keeps a list smaller than one batch intact", () => {
    expect(chunk([1, 2, 3], 90)).toEqual([[1, 2, 3]]);
  });

  it("preserves order and loses no elements", () => {
    const ids = Array.from({ length: 457 }, (_, i) => i);
    expect(chunk(ids, ENRICH_CHUNK_SIZE).flat()).toEqual(ids);
  });

  it("rejects a zero or negative size rather than looping forever", () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -1)).toThrow();
  });
});

describe("ENRICH_CHUNK_SIZE", () => {
  it("stays under D1's 100-bound-parameter ceiling", () => {
    // enrich() binds exactly one parameter per task id, so a batch at or above
    // 100 is the failure that took the whole Tasks module down past ~100 tasks.
    expect(ENRICH_CHUNK_SIZE).toBeLessThan(100);
    expect(ENRICH_CHUNK_SIZE).toBeGreaterThan(0);
  });

  it("never produces a batch that would exceed the ceiling", () => {
    for (const n of [1, 99, 100, 101, 500, 5000]) {
      const ids = Array.from({ length: n }, (_, i) => i);
      for (const batch of chunk(ids, ENRICH_CHUNK_SIZE)) {
        expect(batch.length).toBeLessThan(100);
      }
    }
  });
});
