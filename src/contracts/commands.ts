// Edits a client can ask the editing manager for. Each command is undoable; a batch is one undo step.
import { z } from "zod";
import { Edge, LocalId, Node, Pin, Position } from "./document";

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
    type: z.literal("setRate"),
    graph: GraphScope,
    id: LocalId,
    perSecond: z
      .number()
      .nonnegative()
      .nullable()
      .describe("A source's supply limit or a sink's target, in items per second; null removes it."),
  }),
]);
export type Command = z.infer<typeof Command>;
export type CommandInput = z.input<typeof Command>;
