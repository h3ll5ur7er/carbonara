// Composition root of the web backend: wires managers to their access components and platforms,
// and serves them over a transport (the backend worker's message port).
import builtInPacks from "virtual:built-in-packs";
import { createAutosavedDocumentStore } from "../../access/documents/autosave";
import { createPackLibrary, type IsolatePlugin } from "../../access/packs/library";
import { createMemoryProposalStore } from "../../access/proposals/memory";
import type { Issue } from "../../contracts/issues";
import type { KeyValueStorage } from "../../contracts/platform";
import type { ElkRunner } from "../../engines/layout/arrange";
import { managers, type Events } from "../../contracts/managers";
import type { EventMessage, Request } from "../../contracts/rpc";
import { createAnalysisManager } from "../../managers/analysis";
import { createEditingManager } from "../../managers/editing";
import { createPacksManager } from "../../managers/packs";
import { createPlanningManager } from "../../managers/planning";
import { createWorkspaceManager } from "../../managers/workspace";
import { createIndexedDbStorage } from "../../platforms/web/indexeddb";
import { loadModule } from "../../platforms/web/module-loader";
import { createEventBus } from "../../utilities/events";
import { createDispatcher, type Transport } from "../../utilities/rpc";

export interface BackendOptions {
  /** Where third-party plugins run (the opaque-origin plugin sandbox); without it they run in this worker. */
  isolate?: IsolatePlugin;
  /** The platform's storage, one per name (the desktop app's data folder); IndexedDB by default. */
  storage?: (name: string) => KeyValueStorage;
}

export function startBackend(
  transport: Transport,
  { isolate, storage = createIndexedDbStorage }: BackendOptions = {},
): void {
  const bus = createEventBus<Events>();
  bus.subscribeAll((event, payload) => transport.send({ event, payload } satisfies EventMessage));

  const documents = createAutosavedDocumentStore(storage("carbonara-documents"));
  // Reopen last session's documents before answering. Without storage (IndexedDB in private windows) we start empty;
  // documents that can't be loaded stay saved, and `workspace.getRestoreProblems` reports them.
  let restoreProblems: Issue[] = [];
  const restored = documents
    .restore()
    .then((problems) => {
      restoreProblems = problems;
    })
    .catch(() => undefined);
  const newId = () => crypto.randomUUID();
  // Built-in packs and the installed ones; the workspace and packs managers share the one library.
  const packs = createPackLibrary({
    builtIns: builtInPacks,
    storage: storage("carbonara-packs"),
    loadModule,
    ...(isolate && { isolate }),
  });

  // The planner's proposals: made by the planning manager, accepted by the editing manager.
  const proposals = createMemoryProposalStore();
  const layout = elkInWorker();

  const dispatch = createDispatcher(managers, {
    workspace: createWorkspaceManager({ documents, packs, events: bus, newId, restoreProblems: () => restoreProblems }),
    editing: createEditingManager({ documents, events: bus, newId, layout, proposals }),
    packs: createPacksManager({ library: packs, bus }),
    analysis: createAnalysisManager({ bus, documents, packs }),
    planning: createPlanningManager({ documents, packs, proposals, events: bus, layout }),
  });
  transport.listen(async (message) => {
    await restored;
    transport.send(await dispatch(message as Request));
  });
}

/**
 * ELK for the layout engine, in a worker of its own, started on the first arrange. Not in this worker: ELK's
 * bundle takes over `self.onmessage` in any worker it loads in, and a long layout would hold up every other call.
 */
function elkInWorker(): ElkRunner {
  let elk: Promise<ElkRunner> | undefined;
  return {
    layout: async (graph) => {
      // A classic worker: ELK's script is not a module.
      elk ??= Promise.all([import("elkjs/lib/elk-api.js"), import("elkjs/lib/elk-worker.min.js?url")]).then(
        ([{ default: ELK }, { default: url }]) => new ELK({ workerFactory: () => new Worker(url) }),
      );
      return (await elk).layout(graph);
    },
  };
}
