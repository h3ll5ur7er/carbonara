import { describe, expect, it } from "vitest";
import { nodeLabel } from "./node-label";
import type { NodeView } from "./scene";

const item = { id: "copper-wire", name: "Copper Wire", form: "solid" } as const;
const base = { id: "n", position: { x: 0, y: 0 }, width: 0, height: 0, ports: [] } as unknown as NodeView;
const view = (fields: object) => ({ ...base, ...fields }) as NodeView;

describe("nodeLabel", () => {
  it("names each kind of node the way the canvas shows it", () => {
    expect(
      nodeLabel(
        view({
          kind: "recipe",
          recipe: "wire",
          title: "Copper Wire",
          building: { id: "a", name: "Assembler" },
          alternate: false,
        }),
      ),
    ).toBe("Copper Wire (Assembler)");
    expect(nodeLabel(view({ kind: "source", item }))).toBe("Copper Wire source");
    expect(nodeLabel(view({ kind: "sink", item }))).toBe("Copper Wire output");
    expect(nodeLabel(view({ kind: "junction", item }))).toBe("Copper Wire junction");
    expect(nodeLabel(view({ kind: "junction" }))).toBe("Junction");
    expect(nodeLabel(view({ kind: "frame", label: "Copper" }))).toBe("Frame Copper");
    expect(nodeLabel(view({ kind: "instance", blueprint: "b", title: "Wire line" }))).toBe("Wire line subgraph");
    expect(nodeLabel(view({ kind: "port", direction: "in", item }))).toBe("Copper Wire input port");
  });

  it("names a note by the start of its text", () => {
    expect(nodeLabel(view({ kind: "note", text: "Keep the purifier\nbusy" }))).toBe("Note: Keep the purifier busy");
    expect(nodeLabel(view({ kind: "note", text: "" }))).toBe("Note");
    expect(nodeLabel(view({ kind: "note", text: "a".repeat(100) }))).toHaveLength("Note: ".length + 60);
  });
});
