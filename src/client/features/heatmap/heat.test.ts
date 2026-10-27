import { describe, expect, it } from "vitest";
import { createSceneBuilder } from "../../canvas/model/scene";
import { scenes } from "../../canvas/scenes";
import { templatePack } from "../../scenes/template-pack";
import { heatSpots } from "./heat";

const { document, results } = scenes.congested();
const scene = createSceneBuilder()(document.graph, document.layout.root, templatePack);
const spots = heatSpots(scene, results);

describe("the bottleneck heatmap", () => {
  it("glows along every flow near or over its belt's capacity", () => {
    const flows = new Set(spots.flatMap((spot) => (spot.edge ? [`${spot.edge}:${spot.severity}`] : [])));
    // 22/s on a 15/s belt; 14/s on 15/s belts.
    expect(flows).toEqual(new Set(["plates-all:over", "ore-b:near", "clean-b:near", "plates-b:near"]));
  });

  it("runs the glow along the flow, from port to port", () => {
    const along = spots.filter((spot) => spot.edge === "plates-all");
    expect(along.length).toBeGreaterThanOrEqual(3);
    const merge = scene.nodes.find((node) => node.id === "plate-merge");
    const gears = scene.nodes.find((node) => node.id === "gears");
    const xs = along.map((spot) => spot.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual((merge?.position.x ?? 0) + (merge?.width ?? 0) - 1);
    expect(Math.max(...xs)).toBeLessThanOrEqual((gears?.position.x ?? 0) + 1);
  });

  it("glows around machines short of an input, the hottest of all", () => {
    const short = spots.filter((spot) => spot.node !== undefined);
    expect(short.map((spot) => [spot.node, spot.severity])).toEqual([["goal", "short"]]);
    const goal = scene.nodes.find((node) => node.id === "goal");
    expect(short[0]?.x).toBeCloseTo((goal?.position.x ?? 0) + (goal?.width ?? 0) / 2, 9);
    expect(short[0]?.radius).toBeGreaterThan((goal?.width ?? 0) / 2);
  });

  it("is cool where everything flows freely", () => {
    const calm = {
      ...results,
      diagnostics: [],
      edges: Object.fromEntries(Object.entries(results.edges).map(([id, edge]) => [id, { perSecond: edge.perSecond }])),
    };
    expect(heatSpots(scene, calm)).toEqual([]);
    expect(heatSpots(scene, null)).toEqual([]);
  });
});
