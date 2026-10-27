import { describe, expect, it } from "vitest";
import { connectionItem } from "./connect";

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
