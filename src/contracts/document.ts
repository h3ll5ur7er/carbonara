// The shape of a Carbonara document (`.carbonara` files, autosaves, share links).
// Older versions are upgraded by the documents access component before they are parsed with this schema.
import { z } from "zod";
import { Id, RateUnit } from "./pack";

export const CURRENT_DOCUMENT_VERSION = 1;

/** Ids of nodes, edges and blueprints within a document. */
export const LocalId = z.string().min(1);
export type LocalId = z.infer<typeof LocalId>;

const Rate = z.number().nonnegative();
const FieldValue = z.union([z.number(), z.string(), z.boolean()]);

/** A value the solver must meet exactly. */
export const Pin = z.discriminatedUnion("type", [
  z.object({ type: z.literal("machines"), count: z.number().nonnegative() }),
  z.object({ type: z.literal("rate"), item: Id, perSecond: Rate }),
]);
export type Pin = z.infer<typeof Pin>;

export const Node = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recipe"),
    recipe: Id,
    building: Id.optional().describe("One of the recipe's buildings; the recipe's first when left out."),
    fields: z.record(z.string(), FieldValue).optional().describe("Values of the pack plugin's node fields."),
    pin: Pin.optional(),
  }),
  z.object({
    kind: z.literal("source"),
    item: Id,
    maxPerSecond: Rate.optional().describe("Most this source supplies; unlimited when left out."),
  }),
  z.object({ kind: z.literal("sink"), item: Id, targetPerSecond: Rate.optional() }),
  z.object({ kind: z.literal("junction").describe("Splits and merges flows: splitters, mergers, buses.") }),
  z.object({ kind: z.literal("instance"), blueprint: LocalId }),
  z.object({ kind: z.literal("port"), direction: z.enum(["in", "out"]), item: Id }).describe("A blueprint's boundary."),
  z.object({ kind: z.literal("note"), text: z.string() }),
  z.object({ kind: z.literal("frame"), label: z.string(), tone: z.string().optional() }),
]);
export type Node = z.infer<typeof Node>;
export type NodeKind = Node["kind"];

export const Edge = z.object({
  from: LocalId,
  to: LocalId,
  /** Port of an instance node: the id of the blueprint's port node. Other nodes connect by item. */
  fromPort: LocalId.optional(),
  toPort: LocalId.optional(),
  item: Id,
  logistics: Id.optional().describe("Belt or pipe tier; limits the flow to its capacity."),
  ratio: z.number().min(0).max(1).optional().describe("Fixed share of the source node's output of this item."),
});
export type Edge = z.infer<typeof Edge>;

export const Graph = z.object({
  nodes: z.record(LocalId, Node),
  edges: z.record(LocalId, Edge),
});
export type Graph = z.infer<typeof Graph>;

export const Blueprint = z.object({ name: z.string().min(1), graph: Graph });
export type Blueprint = z.infer<typeof Blueprint>;

/** The colours a node can be tagged with. */
export const TagColour = z.enum(["red", "orange", "yellow", "green", "blue", "purple"]);
export type TagColour = z.infer<typeof TagColour>;

export const Position = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  locked: z.literal(true).optional().describe("Locked nodes stay put: dragging, nudging and arranging leave them."),
  tag: TagColour.optional().describe("A colour tag the user gave the node."),
  flow: z
    .literal("down")
    .optional()
    .describe(
      "Flows enter the node at the top and leave at the bottom, as arranging top to bottom leaves them; " +
        "on the left and right when left out.",
    ),
});
export type Position = z.infer<typeof Position>;

/** Positions per graph: `root`, or a blueprint id. Kept apart so moving nodes never touches the logical graph. */
export const Layout = z.record(z.string(), z.record(LocalId, Position));
export type Layout = z.infer<typeof Layout>;

export const Document = z.object({
  format: z.literal("carbonara"),
  version: z.literal(CURRENT_DOCUMENT_VERSION),
  id: z.string().min(1),
  name: z.string(),
  pack: z.object({ id: Id, version: z.string(), hash: z.string() }),
  graph: Graph,
  blueprints: z.record(LocalId, Blueprint).default({}),
  layout: Layout.default({}),
  settings: z
    .object({
      rateUnit: RateUnit.optional(),
      belt: Id.optional().describe(
        'Show the rates of items this belt or pipe carries as multiples of its capacity ("2 × Fast Conveyor").',
      ),
      machineGroups: z
        .enum(["fill", "even"])
        .optional()
        .describe("How machine counts read: 4 × 100% + 1 × 37.5% (fill, the default) or 5 × 87.5% (even)."),
      plugin: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Settings of the pack's plugin, e.g. a save profile."),
    })
    .default({}),
});
export type Document = z.infer<typeof Document>;
