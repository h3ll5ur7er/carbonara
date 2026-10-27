import { describe, expect, it } from "vitest";
import type { Item } from "../../../contracts/pack";
import { problemsAnnouncement } from "./announcement";

const item = (name: string): Item => ({ id: name.toLowerCase().replace(/ /g, "-"), name, form: "solid" });

describe("problemsAnnouncement", () => {
  it("says nothing while nothing is wrong, so solving quietly is quiet", () => {
    expect(
      problemsAnnouncement({ shortfalls: [], raw: [{ item: item("Ore"), perSecond: 2, limitPerSecond: 5 }] }),
    ).toBe("");
  });

  it("names what the factory is short of, without rates, so it changes only when the shortages do", () => {
    const short = (perSecond: number) => ({
      shortfalls: [
        { item: item("Copper Plate"), perSecond },
        { item: item("Iron Ore"), perSecond: 1 },
      ],
      raw: [],
    });
    expect(problemsAnnouncement(short(2))).toBe("Short of Copper Plate and Iron Ore.");
    expect(problemsAnnouncement(short(3))).toBe(problemsAnnouncement(short(2)));
  });

  it("counts long lists rather than reading them out", () => {
    const shortfalls = ["A", "B", "C", "D", "E"].map((name) => ({ item: item(name), perSecond: 1 }));
    expect(problemsAnnouncement({ shortfalls, raw: [] })).toBe("Short of A, B, C and 2 more.");
  });

  it("says which raw resources are drawn beyond the map", () => {
    const raw = [
      { item: item("Cuprite Ore"), perSecond: 9, limitPerSecond: 5 },
      { item: item("Ferrite Ore"), perSecond: 1, limitPerSecond: 5 },
    ];
    expect(problemsAnnouncement({ shortfalls: [{ item: item("Wire"), perSecond: 1 }], raw })).toBe(
      "Short of Wire. Cuprite Ore over the map's limit.",
    );
  });
});
