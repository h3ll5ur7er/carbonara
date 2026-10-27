// What copying nodes puts on the clipboard: the copied nodes with the flows among them, where they were, and
// what they were connected to. It travels as JSON text on the system clipboard, so a setup pasted into a chat
// can be pasted back into another factory (docs/Design/Editor-quality-of-life.md, Clipboard and ghost placement).
import { z } from "zod";
import { Blueprint, Edge, Graph, LocalId, Position } from "./document";
import { Id } from "./pack";

export const CLIPBOARD_FORMAT = "carbonara-clipboard";

/** A blueprint a copy carries along: the blueprint and its layout. */
export const CopiedBlueprint = Blueprint.extend({ layout: z.record(LocalId, Position).default({}) });
export type CopiedBlueprint = z.infer<typeof CopiedBlueprint>;

export const Clipboard = z.object({
  format: z.literal(CLIPBOARD_FORMAT),
  version: z.literal(1),
  /** The pack of the factory the nodes came from: their recipe, item and belt ids are that pack's. */
  pack: z.object({ id: Id, version: z.string() }),
  /** Where they were copied from; pasting with connections there reconnects them to the nodes they left. */
  source: z.object({ documentId: z.string().min(1), graph: z.string().min(1) }),
  /** The copied nodes and the flows among them. */
  graph: Graph,
  /** Where each copied node was, with its size, lock and tag. */
  layout: z.record(LocalId, Position),
  /** Flows between a copied node and one that wasn't copied, by their ids in the source graph. */
  connections: z.record(LocalId, Edge).default({}),
  /**
   * The blueprints the copied instances place, directly or deeper, by their ids in the source document, with where
   * their nodes sit inside: a paste adds the ones the target lacks.
   */
  blueprints: z.record(LocalId, CopiedBlueprint).default({}),
});
export type Clipboard = z.infer<typeof Clipboard>;
export type ClipboardInput = z.input<typeof Clipboard>;

/** How far a paste lands from where its nodes were copied, in canvas pixels. */
export const PasteOffset = z.object({ x: z.number(), y: z.number() });
export type PasteOffset = z.infer<typeof PasteOffset>;
