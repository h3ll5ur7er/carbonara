// Editing manager: the use cases that change a document. Applies commands through the editing engine, keeps the
// undo history per document (one `apply` batch is one step), saves through the DocumentStore and publishes
// `documentChanged` with the patches, so clients and the analysis manager follow along.
import { documentInfo, type DocumentStore, type OpenDocument } from "../contracts/access";
import type { Command } from "../contracts/commands";
import type { Document } from "../contracts/document";
import type { DocumentInfo, Events, ManagerImplementation } from "../contracts/managers";
import type { Patch } from "../contracts/patches";
import { fail, ok } from "../contracts/result";
import { applyCommands, applyPatches, describeCommands, type ResolvedCommand } from "../engines/editing/commands";
import type { EventBus } from "../utilities/events";

export interface EditingDependencies {
  documents: DocumentStore;
  events: EventBus<Events>;
  /** Ids for nodes and edges the caller didn't name. */
  newId: () => string;
}

interface Step {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
}

interface History {
  undo: Step[];
  redo: Step[];
}

export function createEditingManager({
  documents,
  events,
  newId,
}: EditingDependencies): ManagerImplementation<"editing"> {
  const histories = new Map<string, History>();

  function historyOf(documentId: string): History {
    const history = histories.get(documentId) ?? { undo: [], redo: [] };
    histories.set(documentId, history);
    return history;
  }

  // A closed document's history goes with it.
  events.subscribe("documentsChanged", ({ documents: open }) => {
    const ids = new Set(open.map((document) => document.id));
    for (const documentId of histories.keys()) if (!ids.has(documentId)) histories.delete(documentId);
  });

  function openDocument(documentId: string): OpenDocument {
    const open = documents.get(documentId);
    if (!open) throw new Error(`Unknown document ${documentId}`);
    return open;
  }

  function save(document: Document, patches: Patch[], label: string): DocumentInfo {
    const saved = documents.put(document);
    events.publish("documentChanged", { documentId: document.id, version: saved.version, patches, label });
    return documentInfo(saved);
  }

  /** Moves the latest step from one stack to the other, replaying it in that direction. */
  function replay(documentId: string, direction: "Undo" | "Redo"): DocumentInfo {
    const open = openDocument(documentId);
    const history = historyOf(documentId);
    const [from, to] = direction === "Undo" ? [history.undo, history.redo] : [history.redo, history.undo];
    const step = from.pop();
    if (!step) return documentInfo(open);
    to.push(step);
    const patches = direction === "Undo" ? step.inversePatches : step.patches;
    return save(applyPatches(open.document, patches), patches, `${direction} ${step.label}`);
  }

  return {
    getDocument: async ({ documentId }) => openDocument(documentId),
    apply: async ({ documentId, commands, label }) => {
      const open = documents.get(documentId);
      if (!open) return fail([{ path: ["documentId"], message: `Unknown document ${documentId}` }]);
      const result = applyCommands(
        open.document,
        commands.map((command) => withId(command, newId)),
      );
      if (!result.ok) return result;
      const { document, patches, inversePatches } = result.value;
      if (patches.length === 0) return ok(documentInfo(open));

      const step = { label: label ?? describeCommands(commands), patches, inversePatches };
      const history = historyOf(documentId);
      history.undo.push(step);
      history.redo = [];
      return ok(save(document, patches, step.label));
    },
    undo: async ({ documentId }) => replay(documentId, "Undo"),
    redo: async ({ documentId }) => replay(documentId, "Redo"),
  };
}

function withId(command: Command, newId: () => string): ResolvedCommand {
  if (command.type === "addNode" || command.type === "connect") return { ...command, id: command.id ?? newId() };
  return command;
}
