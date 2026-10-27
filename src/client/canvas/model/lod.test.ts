import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lodTier, type LodTier } from "./lod";

describe("lodTier", () => {
  it("shows full cards while text on them is readable", () => {
    expect(lodTier(1)).toBe("full");
    expect(lodTier(0.6)).toBe("full");
  });

  it("shows compact cards in between", () => {
    expect(lodTier(0.59)).toBe("compact");
    expect(lodTier(0.25)).toBe("compact");
  });

  it("shows chips at overview zoom", () => {
    expect(lodTier(0.24)).toBe("chip");
    expect(lodTier(0.05)).toBe("chip");
  });

  it("never shows more detail when zoomed further out", () => {
    const detail: Record<LodTier, number> = { chip: 0, compact: 1, full: 2 };
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 4, noNaN: true }),
        fc.double({ min: 0.01, max: 4, noNaN: true }),
        (a, b) => {
          const [out, inner] = a < b ? [a, b] : [b, a];
          expect(detail[lodTier(out)]).toBeLessThanOrEqual(detail[lodTier(inner)]);
        },
      ),
    );
  });
});
