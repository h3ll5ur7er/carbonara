import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PackData } from "../../contracts/pack";
import { convertRate } from "./rates";

const pack = {
  units: { rate: "per_second" },
  items: [],
  buildings: [],
  recipes: [],
  resources: [],
  logistics: [
    {
      id: "transport-belt",
      name: "Transport belt",
      aliases: ["yellow belt", "basic belt"],
      carries: "solid",
      capacity: 15,
    },
    { id: "pipe", name: "Pipe", carries: "fluid", capacity: 1200 },
  ],
} satisfies PackData;

const perMinutePack: PackData = {
  ...pack,
  units: { rate: "per_minute" },
  logistics: [{ id: "conveyor-1", name: "Conveyor belt Mk.1", carries: "solid", capacity: 60 }],
};

describe("converting rates", () => {
  it("reads full belts by alias, plural or not, as their capacity", () => {
    for (const unit of ["yellow belt", "yellow belts", "Full yellow belts", "transport-belt", "Transport belt"]) {
      expect(convertRate(pack, 2, unit, "per_minute"), unit).toEqual({
        ok: true,
        value: {
          perSecond: 30,
          inDocumentUnit: { rate: 1800, unit: "per_minute" },
          explanation: "2 × Transport belt at 15/s each",
        },
      });
    }
  });

  it("converts belts given in the pack's own rate unit", () => {
    const conversion = convertRate(perMinutePack, 1, "conveyor belt mk.1", "per_minute");
    expect(conversion).toMatchObject({ ok: true, value: { perSecond: 1, inDocumentUnit: { rate: 60 } } });
  });

  it("converts plain rate units", () => {
    expect(convertRate(pack, 1800, "per_minute", "per_second")).toMatchObject({
      ok: true,
      value: { perSecond: 30, inDocumentUnit: { rate: 30, unit: "per_second" } },
    });
    expect(convertRate(pack, 7200, "/h", "per_second")).toMatchObject({ ok: true, value: { perSecond: 2 } });
    expect(convertRate(pack, 3, "per second", "per_second")).toMatchObject({ ok: true, value: { perSecond: 3 } });
  });

  it("names what it understands when the unit is unknown", () => {
    const conversion = convertRate(pack, 1, "red belt", "per_second");
    expect(conversion).toMatchObject({ ok: false, error: [{ path: ["unit"] }] });
    if (!conversion.ok) {
      expect(conversion.error[0]?.message).toMatch(/Transport belt \(yellow belt, basic belt\), Pipe/);
    }
  });

  it("scales with the amount", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 1e6, noNaN: true }), (amount) => {
        const one = convertRate(pack, 1, "pipe", "per_second");
        const many = convertRate(pack, amount, "pipe", "per_second");
        if (!one.ok || !many.ok) return false;
        return Math.abs(many.value.perSecond - amount * one.value.perSecond) <= 1e-9 * many.value.perSecond;
      }),
    );
  });
});
