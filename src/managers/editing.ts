// Editing manager: the use cases that change a document. Applies commands through the editing engine, keeps the
// undo history per document (one `apply` batch is one step), saves through the DocumentStore and publishes
// `documentChanged` with the patches, so clients and the analysis manager follow along. Arranging asks the
// layout engine for positions and applies them as one move. Accepting a planner's proposal applies its commands
// as one step and settles it in the proposals store, with `proposalChanged`.
import { documentInfo, type DocumentStore, type OpenDocument, type ProposalStore } from "../contracts/access";
import type { Command } from "../contracts/commands";
import type { Document, Graph } from "../contracts/document";
import type { DocumentInfo, Events, ManagerImplementation } from "../contracts/managers";
import type { Patch } from "../contracts/patches";
import { fail, ok, type Result } from "../contracts/result";
import { applyCommands, applyPatches, describeCommands, type ResolvedCommand } from "../engines/editing/commands";
import { copyNodes, pasteCommands, pasteLabel } from "../engines/editing/clipboard";
import { arrange, type ElkRunner } from "../engines/layout/arrange";
import { placeProposal } from "../engines/planning";
import type { EventBus } from "../utilities/events";

export interface EditingDependencies {
  documents: DocumentStore;
  events: EventBus<Events>;
  /** Ids for nodes and edges the caller didn't name. */
  newId: () => string;
  /** Runs ELK for the layout engine (in a worker of its own in the app). */
  layout: ElkRunner;
  /** The planner's proposals, which `applyProposal` accepts. */
  proposals: ProposalStore;
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
  layout,
  proposals,
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

  /** Applies a batch as one undo step. */
  function commit(documentId: string, commands: Command[], label: string | undefined): Result<DocumentInfo> {
    return commitResolved(
      documentId,
      commands.map((command) => withId(command, newId)),
      label ?? describeCommands(commands),
    );
  }

  /** Applies a batch whose new nodes and flows have their ids as one undo step. */
  function commitResolved(documentId: string, commands: ResolvedCommand[], label: string): Result<DocumentInfo> {
    const open = documents.get(documentId);
    if (!open) return unknownDocument(documentId);
    const result = applyCommands(open.document, commands);
    if (!result.ok) return result;
    const { document, patches, inversePatches } = result.value;
    if (patches.length === 0) return ok(documentInfo(open));

    const step = { label, patches, inversePatches };
    const history = historyOf(documentId);
    history.undo.push(step);
    history.redo = [];
    return ok(save(document, patches, step.label));
  }

  return {
    getDocument: async ({ documentId }) => openDocument(documentId),
    apply: async ({ documentId, commands, label }) => commit(documentId, commands, label),
    applyProposal: async ({ proposalId, label, offset }) => {
      const stored = proposals.get(proposalId);
      if (!stored) return fail([{ path: ["proposalId"], message: `Unknown proposal ${proposalId}` }]);
      const { proposal, status } = stored;
      if (status !== "pending") return fail([{ path: ["proposalId"], message: settled[status](proposalId) }]);
      const applied = commit(proposal.documentId, placeProposal(proposal, offset), label);
      if (!applied.ok) return applied;
      proposals.settle(proposalId, "accepted");
      events.publish("proposalChanged", { proposal, status: "accepted" });
      return applied;
    },
    undo: async ({ documentId }) => replay(documentId, "Undo"),
    redo: async ({ documentId }) => replay(documentId, "Redo"),
    arrange: async ({ documentId, graph: scope, direction, nodeIds, shapes }) => {
      const open = documents.get(documentId);
      if (!open) return unknownDocument(documentId);
      const graph = graphOf(open.document, scope);
      if (!graph) return fail([{ path: ["graph"], message: `Unknown graph ${scope}` }]);
      const positions = open.document.layout[scope] ?? {};
      const arranged = await arrange({ graph, positions, shapes, direction, nodeIds }, layout);

      // ELK takes a moment: move the nodes that still exist then, keeping their other layout fields. Their flows
      // run the way they were arranged: down puts their ports on the top and bottom edges.
      const latest = documents.get(documentId);
      if (!latest) return unknownDocument(documentId);
      const nodes = graphOf(latest.document, scope)?.nodes ?? {};
      const latestLayout = latest.document.layout[scope] ?? {};
      const moves = Object.fromEntries(
        Object.entries(arranged)
          .filter(([id]) => nodes[id] && !latestLayout[id]?.locked)
          .map(([id, at]) => {
            const { flow: _flow, ...kept } = latestLayout[id] ?? {};
            return [id, { ...kept, ...at, ...(direction === "down" && { flow: "down" as const }) }];
          }),
      );
      if (Object.keys(moves).length === 0) return ok(documentInfo(latest));
      return commit(documentId, [{ type: "moveNodes", graph: scope, positions: moves }], "Arrange");
    },
    copy: async ({ documentId, graph, nodeIds }) => {
      const open = documents.get(documentId);
      if (!open) return unknownDocument(documentId);
      return copyNodes(open.document, graph, nodeIds);
    },
    paste: async ({ documentId, graph, clipboard, offset, connections, label }) => {
      const open = documents.get(documentId);
      if (!open) return unknownDocument(documentId);
      const paste = pasteCommands(open.document, graph, clipboard, { offset, connections }, newId);
      if (!paste.ok) return paste;
      const { commands, nodeIds, leftOut } = paste.value;
      const pasted = (document: DocumentInfo) => ok({ document, nodeIds, leftOut });
      if (commands.length === 0) return pasted(documentInfo(open));
      const result = commitResolved(documentId, commands, label ?? pasteLabel(nodeIds.length));
      return result.ok ? pasted(result.value) : result;
    },
  };
}

/** Why a proposal that isn't pending can't be applied, in words a model can act on. */
const settled = {
  accepted: (id: string) => `Proposal ${id} is accepted already: it's in the document.`,
  discarded: (id: string) =>
    `The person discarded proposal ${id} in Carbonara. Ask them what to change, then plan again.`,
  replaced: (id: string) => `A newer plan for the document replaced proposal ${id}; apply that one instead.`,
};

function graphOf(document: Document, scope: string): Graph | undefined {
  return scope === "root" ? document.graph : document.blueprints[scope]?.graph;
}

function unknownDocument(documentId: string): Result<never> {
  return fail([{ path: ["documentId"], message: `Unknown document ${documentId}` }]);
}

function withId(command: Command, newId: () => string): ResolvedCommand {
  if (command.type === "addNode" || command.type === "connect") return { ...command, id: command.id ?? newId() };
  if (command.type === "collapse") {
    return { ...command, blueprint: command.blueprint ?? newId(), instance: command.instance ?? newId() };
  }
  return command;
}
