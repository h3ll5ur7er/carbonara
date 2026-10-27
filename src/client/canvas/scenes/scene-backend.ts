// A stand-in backend for the dev scenes: the real connector and RPC dispatcher (so arguments are validated
// against the contracts), with `editing.apply` applying commands to the scene's document in memory.
// Dev and test fixture only, until the editing manager (CARB-33) runs in the backend worker.
import { produce, type Draft } from "immer";
import type { Command } from "../../../contracts/commands";
import type { Document } from "../../../contracts/document";
import { managers, type DocumentInfo } from "../../../contracts/managers";
import { ok } from "../../../contracts/result";
import type { Request } from "../../../contracts/rpc";
import { createDispatcher, type Transport } from "../../../utilities/rpc";
import { createConnector, type Connector } from "../../core/connector";

export interface SceneBackend {
  connector: Connector;
  /** Every command applied so far, in order; e2e tests read it from `window.carbonaraScene`. */
  commands: Command[];
}

export function createSceneBackend(initial: Document, onChange: (document: Document) => void): SceneBackend {
  let document = initial;
  let version = 1;
  let nextId = 1;
  const commands: Command[] = [];

  const info = (): DocumentInfo => ({ id: document.id, name: document.name, packId: document.pack.id, version });
  const dispatch = createDispatcher(managers, {
    editing: {
      getDocument: async () => document,
      apply: async (args) => {
        document = produce(document, (draft) => {
          for (const command of args.commands) apply(draft, command, () => `new-${nextId++}`);
        });
        commands.push(...args.commands);
        version += 1;
        onChange(document);
        return ok(info());
      },
    },
  });

  const listeners = new Set<(message: unknown) => void>();
  const transport: Transport = {
    send: (message) => void dispatch(message as Request).then((response) => listeners.forEach((l) => l(response))),
    listen: (listener) => void listeners.add(listener),
  };
  return { connector: createConnector(transport), commands };
}

function apply(draft: Draft<Document>, command: Command, newId: () => string) {
  const graph = command.graph === "root" ? draft.graph : draft.blueprints[command.graph]?.graph;
  if (!graph) return;
  const layout = (draft.layout[command.graph] ??= {});
  switch (command.type) {
    case "addNode": {
      const id = command.id ?? newId();
      graph.nodes[id] = command.node;
      layout[id] = command.position;
      return;
    }
    case "connect":
      graph.edges[command.id ?? newId()] = command.edge;
      return;
    case "moveNodes":
      Object.assign(layout, command.positions);
      return;
    default:
      // The scenes only add, connect and move; other edits wait for the editing engine (CARB-32).
      return;
  }
}
