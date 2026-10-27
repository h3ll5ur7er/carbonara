import { describe, expect, it } from "vitest";
import { PackData } from "../../../contracts/pack";
import { alternatesOf, unlockEdit, unlockedCount } from "./profile";

const recipe = (id: string, name: string, alternate = false) => ({
  id,
  name,
  buildings: ["press"],
  time: 1,
  out: { plate: 1 },
  ...(alternate && { tags: ["alternate"] }),
});

const pack = PackData.parse({
  items: [{ id: "plate", name: "Plate", form: "solid" }],
  buildings: [{ id: "press", name: "Press" }],
  recipes: [
    recipe("plate", "Plate"),
    recipe("alt-stamped", "Alternate: Stamped Plate", true),
    recipe("alt-bolted", "Alternate: Bolted Plate", true),
  ],
});

describe("the save profile's alternates", () => {
  it("lists the pack's alternate recipes by name", () => {
    expect(alternatesOf(pack).map((entry) => entry.id)).toEqual(["alt-bolted", "alt-stamped"]);
  });

  it("counts every alternate as unlocked until the document has a profile", () => {
    expect(unlockedCount(pack, {})).toBe(2);
    expect(unlockedCount(pack, { unlocked: ["alt-bolted", "elsewhere"] })).toBe(1);
  });

  it("locks one alternate by listing all the others", () => {
    expect(unlockEdit(pack, {}, { recipe: "alt-stamped", unlocked: false })).toEqual({
      settings: { unlocked: ["alt-bolted"] },
      label: "Lock Alternate: Stamped Plate",
    });
  });

  it("unlocks one alternate, keeping the list in pack order", () => {
    expect(unlockEdit(pack, { unlocked: ["alt-stamped"] }, { recipe: "alt-bolted", unlocked: true })).toEqual({
      settings: { unlocked: ["alt-stamped", "alt-bolted"] },
      label: "Unlock Alternate: Bolted Plate",
    });
  });

  it("unlocks everything by removing the profile's list, and locks everything with an empty one", () => {
    expect(unlockEdit(pack, { unlocked: [] }, { all: true })).toEqual({
      settings: { unlocked: null },
      label: "Unlock all alternates",
    });
    expect(unlockEdit(pack, {}, { all: false })).toEqual({ settings: { unlocked: [] }, label: "Lock all alternates" });
  });
});
