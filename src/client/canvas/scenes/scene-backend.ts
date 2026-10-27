// A stand-in backend for the canvas scenes: the scenes' fake connector (real RPC envelope and argument
// validation) with `editing.apply` applying commands to the scene's document in memory, and the scene's pack.
// Dev and test fixture only, until the editing manager (CARB-33) runs in the backend worker.
import { produce, type Draft } from "immer";
import type { Command } from "../../../contracts/commands";
import type { Document } from "../../../contracts/document";
import type { DocumentInfo } from "../../../contracts/managers";
import type { PackData } from "../../../contracts/pack";
import { ok } from "../../../contracts/result";
import type { Connector } from "../../core/connector";
import { fakeConnector } from "../../scenes/fake-backend";

export interface SceneBackend {
  connector: Connector;
  /** Every command applied so far, in order; e2e tests read it from `window.carbonaraScene`. */
  commands: Command[];
}

export function createSceneBackend(
  initial: Document,
  pack: PackData,
  onChange: (document: Document) => void,
): SceneBackend {
  let document = initial;
  let version = 1;
  let nextId = 1;
  const commands: Command[] = [];

  const info = (): DocumentInfo => ({ id: document.id, name: document.name, packId: document.pack.id, version });
  const connector = fakeConnector({
    editing: {
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
    packs: { getPackData: async () => pack },
  });
  return { connector, commands };
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
