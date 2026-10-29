import { describe, expect, it } from "vitest";
import { PackData } from "../../contracts/pack";
import { iconsOf } from "./pack-icons";

const pack = PackData.parse({
  items: [
    { id: "ore", name: "Ore", form: "solid", icon: "icons/ore.webp" },
    { id: "water", name: "Water", form: "fluid" },
    { id: "slag", name: "Slag", form: "solid", icon: "icons/missing.webp" },
  ],
  buildings: [{ id: "press", name: "Press", icon: "icons/press.webp" }],
});

describe("iconsOf", () => {
  it("gives the URL of each item's and building's icon, by id", () => {
    const icons = iconsOf(pack, { "icons/ore.webp": "data:ore", "icons/press.webp": "data:press" });
    expect([...icons.items]).toEqual([["ore", "data:ore"]]);
    expect([...icons.buildings]).toEqual([["press", "data:press"]]);
  });

  it("gives none without the pack's data or its icons", () => {
    expect(iconsOf(undefined, { "icons/ore.webp": "data:ore" }).items.size).toBe(0);
    expect(iconsOf(pack, {}).items.size).toBe(0);
  });
});
