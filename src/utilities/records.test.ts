import { describe, expect, it } from "vitest";
import { addTo, own } from "./records";

describe("records keyed by ids", () => {
  it("reads only own keys, so an id such as constructor finds nothing in an empty record", () => {
    expect(own({}, "constructor")).toBeUndefined();
    expect(own({}, "toString")).toBeUndefined();
    expect(own({ constructor: 2 }, "constructor")).toBe(2);
  });

  it("adds up from zero whatever the id is called", () => {
    const counts: Record<string, number> = {};
    addTo(counts, "constructor", 3);
    addTo(counts, "constructor", 1);
    addTo(counts, "valueOf", 2);
    expect(counts).toEqual({ constructor: 4, valueOf: 2 });
  });
});
