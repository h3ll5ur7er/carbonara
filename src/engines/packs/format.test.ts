import { describe, expect, it } from "vitest";
import { PACK_FORMAT, supportsRange } from "./format";

describe("supportsRange", () => {
  it.each([
    ["^1", "1.0.0", true],
    ["^1", "1.9.3", true],
    ["^1", "2.0.0", false],
    ["^1.2", "1.1.0", false],
    ["^1.2", "1.2.0", true],
    ["^0.2", "0.2.5", true],
    ["^0.2", "0.3.0", false],
    ["^0.0.3", "0.0.4", false],
    ["~1.2", "1.2.7", true],
    ["~1.2", "1.3.0", false],
    ["~1", "1.5.0", true],
    ["1", "1.4.0", true],
    ["1", "2.0.0", false],
    ["1.2", "1.2.9", true],
    ["1.2", "1.3.0", false],
    ["1.2.3", "1.2.3", true],
    ["1.2.3", "1.2.4", false],
  ])("%s with %s is %s", (range, version, expected) => {
    expect(supportsRange(range, version)).toBe(expected);
  });

  it("accepts the range the template pack declares", () => {
    expect(supportsRange("^1", PACK_FORMAT)).toBe(true);
  });
});
