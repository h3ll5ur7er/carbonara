import { describe, expect, it } from "vitest";
import { Document } from "../../../contracts/document";
import { exampleDocument } from "../../../contracts/document.fixture";
import { stepDone, tourSnapshot, type TourSnapshot } from "./tour";

const starter: TourSnapshot = {
  documentId: "doc-1",
  recipes: ["plates"],
  edges: [{ from: "ore", to: "plates" }],
  targets: "[]",
  targetCount: 0,
  plannerOpen: false,
};
const after = (change: Partial<TourSnapshot>): TourSnapshot => ({ ...starter, ...change });

describe("the tour's steps", () => {
  it("are done adding once there's a new recipe node", () => {
    expect(stepDone("add", starter, starter, starter)).toBe(false);
    expect(stepDone("add", starter, starter, after({ recipes: ["plates", "wire"] }))).toBe(true);
  });

  it("are done connecting once the new recipe has flows in and out", () => {
    const added = after({ recipes: ["plates", "wire"] });
    const halfway = after({ ...added, edges: [...starter.edges, { from: "plates", to: "wire" }] });
    const through = after({ ...halfway, edges: [...halfway.edges, { from: "wire", to: "out" }] });
    expect(stepDone("connect", starter, added, halfway)).toBe(false);
    expect(stepDone("connect", starter, added, through)).toBe(true);
  });

  it("are done connecting with any new flow when no recipe was added", () => {
    expect(stepDone("connect", starter, starter, after({ edges: [...starter.edges, { from: "a", to: "b" }] }))).toBe(
      true,
    );
  });

  it("are done targeting once a target is set or changed, not removed", () => {
    const set = after({ targets: '[["out",1]]', targetCount: 1 });
    expect(stepDone("target", starter, starter, set)).toBe(true);
    expect(stepDone("target", starter, set, after({ targets: '[["out",2]]', targetCount: 1 }))).toBe(true);
    expect(stepDone("target", starter, set, starter)).toBe(false);
  });

  it("are done planning once the planner is open", () => {
    expect(stepDone("plan", starter, starter, after({ plannerOpen: true }))).toBe(true);
  });

  it("wait for the person on the steps that only explain", () => {
    const changed = after({ recipes: ["x"], plannerOpen: true, targets: "x", targetCount: 1 });
    for (const step of ["welcome", "solve", "done"] as const)
      expect(stepDone(step, starter, starter, changed)).toBe(false);
  });

  it("ignore other documents", () => {
    expect(stepDone("add", starter, starter, after({ documentId: "doc-2", recipes: ["plates", "wire"] }))).toBe(false);
  });
});

describe("tourSnapshot", () => {
  it("lists recipes, flows and targets of the root graph", () => {
    const document = Document.parse(exampleDocument);
    const snapshot = tourSnapshot("doc-1", document, false);
    expect(snapshot.recipes).toContain("smelt");
    expect(snapshot.edges.length).toBe(Object.keys(document.graph.edges).length);
    expect(tourSnapshot("doc-1", document, true).plannerOpen).toBe(true);
  });
});
