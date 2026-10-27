// Edits a client can ask the editing manager for. Each command is undoable; a batch is one undo step.
import { z } from "zod";
import { Edge, LocalId, Node, Pin, Position, TagColour } from "./document";
import { Id, RateUnit } from "./pack";

/** `root`, or the id of the blueprint whose graph the command edits. */
export const GraphScope = z.string().min(1).default("root");

export const Command = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("addNode"),
    graph: GraphScope,
    id: LocalId.optional().describe("Chosen by the manager when left out."),
    node: Node,
    position: Position,
  }),
  z.object({ type: z.literal("removeNodes"), graph: GraphScope, ids: z.array(LocalId).min(1) }),
  z.object({ type: z.literal("connect"), graph: GraphScope, id: LocalId.optional(), edge: Edge }),
  z.object({ type: z.literal("disconnect"), graph: GraphScope, ids: z.array(LocalId).min(1) }),
  z.object({ type: z.literal("moveNodes"), graph: GraphScope, positions: z.record(LocalId, Position) }),
  z.object({
    type: z.literal("setNodeFields"),
    graph: GraphScope,
    id: LocalId,
    fields: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  }),
  z.object({ type: z.literal("setPin"), graph: GraphScope, id: LocalId, pin: Pin.nullable() }),
  z.object({
    type: z.literal("setPluginSettings"),
    /** Settings are document-wide; the scope is kept so that every command has one. */
    graph: GraphScope,
    settings: z
      .record(z.string(), z.unknown())
      .describe("Merged into the document's `settings.plugin` (the save profile); null removes a setting."),
  }),
  z.object({
    type: z.literal("setRate"),
    graph: GraphScope,
    id: LocalId,
    perSecond: z
      .number()
      .nonnegative()
      .nullable()
      .describe("A source's supply limit or a sink's target, in items per second; null removes it."),
  }),
  z
    .object({
      type: z.literal("setRecipe"),
      graph: GraphScope,
      ids: z.array(LocalId).min(1),
      recipe: Id,
      building: Id.optional().describe("The building to run it in; the recipe's first when left out."),
    })
    .describe(
      "Changes the recipe of recipe nodes; their fields and pins stay. Flows the recipe can't take aren't removed.",
    ),
  z
    .object({ type: z.literal("setText"), graph: GraphScope, id: LocalId, text: z.string() })
    .describe("Changes a note's text or a frame's label."),
  z
    .object({ type: z.literal("setTag"), graph: GraphScope, ids: z.array(LocalId).min(1), tag: TagColour.nullable() })
    .describe("Gives nodes a colour tag (on their position), or removes it."),
  z
    .object({
      type: z.literal("setLogistics"),
      graph: GraphScope,
      ids: z.array(LocalId).min(1),
      logistics: Id.nullable().describe("The belt or pipe tier; null leaves the flow unlimited."),
    })
    .describe("Sets the belt or pipe tier of flows."),
  z
    .object({
      type: z.literal("setSettings"),
      settings: z.object({
        rateUnit: RateUnit.nullable().optional(),
        belt: Id.nullable().optional(),
        machineGroups: z.enum(["fill", "even"]).nullable().optional(),
      }),
    })
    .describe("Changes the document's display settings; null puts one back to its default, a missing one stays."),
  z
    .object({ type: z.literal("renameDocument"), name: z.string().trim().min(1).max(120) })
    .describe("Renames the factory (its tab follows)."),
  z
    .object({ type: z.literal("removeAndBridge"), graph: GraphScope, ids: z.array(LocalId).min(1) })
    .describe(
      "Removes nodes and keeps the flow connected: each flow that went into them is connected to each that came " +
        "out of them with the same item. New flows are named after the two they join (`in+out`).",
    ),
  z
    .object({ type: z.literal("setLocked"), graph: GraphScope, ids: z.array(LocalId).min(1), locked: z.boolean() })
    .describe("Locks nodes in place (dragging, nudging and arranging leave them), or unlocks them."),
  z
    .object({
      type: z.literal("collapse"),
      graph: GraphScope,
      ids: z.array(LocalId).min(1).describe("The nodes to collapse; not ports."),
      blueprint: LocalId.optional().describe("The new blueprint's id. Chosen by the manager when left out."),
      instance: LocalId.optional().describe("The id of the instance that takes their place. Chosen when left out."),
      name: z.string().min(1).describe("The new blueprint's name."),
      bounds: z
        .object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() })
        .optional()
        .describe("Where the nodes are drawn, so the ports go beside them. Estimated from positions when left out."),
    })
    .describe(
      "Collapses nodes into a subgraph: moves them into a new blueprint and puts an instance of it where they " +
        "were. Each flow that crossed the selection now runs through a port of the blueprint (ports are inferred " +
        "from those flows; flows of one item from one node share a port).",
    ),
  z
    .object({ type: z.literal("expand"), graph: GraphScope, id: LocalId.describe("A subgraph instance node.") })
    .describe(
      "Expands a subgraph instance: puts a copy of its blueprint's nodes and flows in its place and reconnects " +
        "the flows through its ports. Expanding the last instance of a blueprint dissolves the blueprint.",
    ),
  z
    .object({ type: z.literal("renameBlueprint"), blueprint: LocalId, name: z.string().min(1) })
    .describe("Renames a blueprint (every instance shows the new name)."),
]);
export type Command = z.infer<typeof Command>;
export type CommandInput = z.input<typeof Command>;
