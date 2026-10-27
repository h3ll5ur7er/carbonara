import { describe, expect, it } from "vitest";
import { templatePack } from "../../scenes/template-pack";
import { subgraphScene, SUBGRAPH_BLUEPRINT } from "../../canvas/scenes/subgraph";
import { deleteEdit, duplicateEdit, libraryEntries } from "./library";

const { document } = subgraphScene(templatePack);
const withSpare = {
  ...document,
  blueprints: {
    ...document.blueprints,
    spare: {
      name: "Anvil",
      graph: { nodes: { cell: { kind: "instance" as const, blueprint: SUBGRAPH_BLUEPRINT } }, edges: {} },
    },
  },
};

describe("the blueprint library", () => {
  it("lists the document's blueprints by name, with their ports' items and how often they're placed", () => {
    expect(libraryEntries(withSpare, templatePack, "root")).toEqual([
      { id: "spare", name: "Anvil", inputs: [], outputs: [], instances: 0, nodes: 1, placeable: true },
      {
        id: SUBGRAPH_BLUEPRINT,
        name: "Copper Wire line",
        inputs: [{ id: "cuprite-ore", name: "Cuprite Ore", form: "solid" }],
        outputs: [
          { id: "copper-wire", name: "Copper Wire", form: "solid" },
          { id: "slag", name: "Slag", form: "solid" },
        ],
        instances: 3,
        nodes: 3,
        placeable: true,
      },
    ]);
  });

  it("can't place a blueprint inside itself, or inside one it's part of", () => {
    const inside = (graph: string) =>
      Object.fromEntries(libraryEntries(withSpare, templatePack, graph).map((entry) => [entry.id, entry.placeable]));
    expect(inside(SUBGRAPH_BLUEPRINT)).toEqual({ spare: false, [SUBGRAPH_BLUEPRINT]: false });
    expect(inside("spare")).toEqual({ spare: false, [SUBGRAPH_BLUEPRINT]: true });
  });
});

describe("managing blueprints", () => {
  it("duplicates one as a new blueprint with its insides and layout, under a name the document doesn't have", () => {
    const edit = duplicateEdit(withSpare, SUBGRAPH_BLUEPRINT);
    expect(edit).toEqual({
      commands: [
        {
          type: "addBlueprint",
          blueprint: { name: "Copper Wire line copy", graph: document.blueprints[SUBGRAPH_BLUEPRINT]?.graph },
          layout: withSpare.layout[SUBGRAPH_BLUEPRINT],
        },
      ],
      label: "Duplicate Copper Wire line",
    });
    const copied = {
      ...withSpare,
      blueprints: { ...withSpare.blueprints, copy: { name: "Copper Wire line copy", graph: { nodes: {}, edges: {} } } },
    };
    expect(duplicateEdit(copied, SUBGRAPH_BLUEPRINT)?.commands[0]).toMatchObject({
      blueprint: { name: "Copper Wire line copy 2" },
    });
    expect(duplicateEdit(withSpare, "nope")).toBeUndefined();
  });

  it("deletes blueprints in one edit, named after the one or how many", () => {
    expect(deleteEdit(withSpare, ["spare"])).toEqual({
      commands: [{ type: "removeBlueprint", blueprint: "spare" }],
      label: "Delete Anvil",
    });
    expect(deleteEdit(withSpare, ["spare", SUBGRAPH_BLUEPRINT])?.label).toBe("Delete 2 blueprints");
    expect(deleteEdit(withSpare, [])).toBeUndefined();
  });
});
