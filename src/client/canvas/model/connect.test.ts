import { describe, expect, it } from "vitest";
import { connectionItem, portOf } from "./connect";

describe("connectionItem", () => {
  it("is the item both ports carry", () => {
    expect(connectionItem({ source: "a", target: "b", sourceHandle: "out:plate", targetHandle: "in:plate" })).toBe(
      "plate",
    );
  });

  it("refuses ports of different items", () => {
    expect(
      connectionItem({ source: "a", target: "b", sourceHandle: "out:plate", targetHandle: "in:ore" }),
    ).toBeUndefined();
  });

  it("lets a junction take the item of the other end", () => {
    expect(connectionItem({ source: "a", target: "j", sourceHandle: "out:plate", targetHandle: "in" })).toBe("plate");
    expect(connectionItem({ source: "j", target: "b", sourceHandle: "out", targetHandle: "in:ore" })).toBe("ore");
  });

  it("refuses junction to junction, since neither end names the item", () => {
    expect(connectionItem({ source: "j", target: "k", sourceHandle: "out", targetHandle: "in" })).toBeUndefined();
  });

  it("refuses loops onto the same node and connections against the flow", () => {
    expect(
      connectionItem({ source: "a", target: "a", sourceHandle: "out:plate", targetHandle: "in:plate" }),
    ).toBeUndefined();
    expect(
      connectionItem({ source: "a", target: "b", sourceHandle: "in:plate", targetHandle: "out:plate" }),
    ).toBeUndefined();
  });
});

describe("instance ports", () => {
  it("carry their item before the `#` and the blueprint's port after it", () => {
    expect(
      connectionItem({ source: "a", target: "line", sourceHandle: "out:plate", targetHandle: "in:plate#in-plate" }),
    ).toBe("plate");
    expect(
      connectionItem({ source: "line", target: "b", sourceHandle: "out:plate@rare#p", targetHandle: "in:ore" }),
    ).toBeUndefined();
    expect(portOf("in:plate#in-plate")).toBe("in-plate");
    expect(portOf("out:gear@rare#out~2")).toBe("out~2");
    expect(portOf("in:plate")).toBeUndefined();
    expect(portOf("in")).toBeUndefined();
  });
});
