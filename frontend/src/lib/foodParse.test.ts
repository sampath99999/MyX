import { describe, it, expect } from "vitest";
import { MAX_PARSED_QUANTITY, parseFoodLine } from "./foodParse";

describe("parseFoodLine", () => {
  it("reads a plain quantity and name", () => {
    expect(parseFoodLine("2 dosa")).toEqual([{ name: "dosa", quantity: 2 }]);
  });

  it("defaults to one serving when no number is given", () => {
    expect(parseFoodLine("filter coffee")).toEqual([{ name: "filter coffee", quantity: 1 }]);
  });

  it("splits a list on commas", () => {
    expect(parseFoodLine("2 idli, 1 filter coffee")).toEqual([
      { name: "idli", quantity: 2 },
      { name: "filter coffee", quantity: 1 },
    ]);
  });

  it("splits on 'and' and on a plus, because both get typed", () => {
    expect(parseFoodLine("3 idli and 1 sambar")).toHaveLength(2);
    expect(parseFoodLine("2 chapati + dal tadka")).toEqual([
      { name: "chapati", quantity: 2 },
      { name: "dal tadka", quantity: 1 },
    ]);
  });

  it("understands number words", () => {
    expect(parseFoodLine("three idli")).toEqual([{ name: "idli", quantity: 3 }]);
    expect(parseFoodLine("a banana")).toEqual([{ name: "banana", quantity: 1 }]);
  });

  it("understands halves, written either way", () => {
    expect(parseFoodLine("0.5 plate biryani")).toEqual([{ name: "biryani", quantity: 0.5 }]);
    expect(parseFoodLine("1/2 dosa")).toEqual([{ name: "dosa", quantity: 0.5 }]);
    expect(parseFoodLine("half plate biryani")).toEqual([{ name: "biryani", quantity: 0.5 }]);
  });

  it("drops the measure word, so the name can match a library row", () => {
    // The library's serving for dal already is a katori; leaving the word in
    // means searching for "katori dal" and matching nothing.
    expect(parseFoodLine("2 katori dal")).toEqual([{ name: "dal", quantity: 2 }]);
    expect(parseFoodLine("1 glass milk")).toEqual([{ name: "milk", quantity: 1 }]);
    expect(parseFoodLine("2 cups of tea")).toEqual([{ name: "tea", quantity: 2 }]);
  });

  it("keeps a measure word that is the whole name", () => {
    // Otherwise the name is emptied out and the item vanishes silently.
    expect(parseFoodLine("1 plate")).toEqual([{ name: "plate", quantity: 1 }]);
  });

  it("keeps multi-word food names intact", () => {
    expect(parseFoodLine("1 paneer butter masala")).toEqual([
      { name: "paneer butter masala", quantity: 1 },
    ]);
  });

  it("ignores empty fragments from trailing separators", () => {
    expect(parseFoodLine("2 idli, ")).toEqual([{ name: "idli", quantity: 2 }]);
    expect(parseFoodLine("")).toEqual([]);
    expect(parseFoodLine("  ,  , ")).toEqual([]);
  });

  it("caps an implausible quantity rather than ruining the day's total", () => {
    // A stray digit should not put 13,000 calories on the chart.
    expect(parseFoodLine("100 dosa")[0].quantity).toBe(MAX_PARSED_QUANTITY);
  });

  it("never returns a zero or negative quantity", () => {
    for (const line of ["0 dosa", "-2 idli"]) {
      for (const item of parseFoodLine(line)) {
        expect(item.quantity).toBeGreaterThan(0);
      }
    }
  });

  it("handles a multi-line paste", () => {
    expect(parseFoodLine("2 idli\n1 sambar\n1 coffee")).toHaveLength(3);
  });
});
