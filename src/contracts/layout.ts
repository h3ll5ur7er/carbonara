// What the layout engine needs to know about how a node is drawn: its size and where its ports sit. Only the
// client knows its geometry (src/client/canvas/model/geometry.ts), so it sends the shapes with an arrange request.
import { z } from "zod";
import { LocalId } from "./document";
import { Id } from "./pack";

export const PortShape = z.object({
  side: z.enum(["in", "out"]),
  item: Id.optional().describe("The item the port carries; any item (a junction) when left out."),
  /** Relative to the node's top-left corner. */
  x: z.number(),
  y: z.number(),
});
export type PortShape = z.infer<typeof PortShape>;

export const NodeShape = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  ports: z.array(PortShape).default([]),
});
export type NodeShape = z.infer<typeof NodeShape>;

/** Left → right (inputs on the left, the default) or top → bottom. */
export const ArrangeDirection = z.enum(["right", "down"]);
export type ArrangeDirection = z.infer<typeof ArrangeDirection>;

export const ArrangeOptions = z.object({
  direction: ArrangeDirection.default("right"),
  nodeIds: LocalId.array().optional().describe("The nodes to arrange (a selection); every node when left out."),
  shapes: z
    .record(LocalId, NodeShape)
    .default({})
    .describe("How each node is drawn; nodes without a shape count as a small square."),
});
export type ArrangeOptions = z.infer<typeof ArrangeOptions>;
