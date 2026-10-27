/** A change to a document, in the shape Immer produces and applies. */
export interface Patch {
  op: "replace" | "add" | "remove";
  path: (string | number)[];
  value?: unknown;
}
