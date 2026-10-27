// Composition root of the web backend: wires managers to their access components and platforms,
// and serves them over a transport (the backend worker's message port).
import builtInPacks from "virtual:built-in-packs";
import { createAutosavedDocumentStore } from "../../access/documents/autosave";
import { createPackLibrary, type IsolatePlugin } from "../../access/packs/library";
import type { Issue } from "../../contracts/issues";
import { managers, type Events } from "../../contracts/managers";
import type { EventMessage, Request } from "../../contracts/rpc";
import { createAnalysisManager } from "../../managers/analysis";
import { createEditingManager } from "../../managers/editing";
import { createPacksManager } from "../../managers/packs";
import { createWorkspaceManager } from "../../managers/workspace";
import { createIndexedDbStorage } from "../../platforms/web/indexeddb";
import { loadModule } from "../../platforms/web/module-loader";
import { createEventBus } from "../../utilities/events";
import { createDispatcher, type Transport } from "../../utilities/rpc";

export interface BackendOptions {
  /** Where third-party plugins run (the opaque-origin plugin sandbox); without it they run in this worker. */
  isolate?: IsolatePlugin;
}

export function startBackend(transport: Transport, { isolate }: BackendOptions = {}): void {
  const bus = createEventBus<Events>();
  bus.subscribeAll((event, payload) => transport.send({ event, payload } satisfies EventMessage));

  const documents = createAutosavedDocumentStore(createIndexedDbStorage("carbonara-documents"));
  // Reopen last session's documents before answering. Without IndexedDB (private windows) we start empty;
  // documents that can't be loaded stay saved, and `workspace.getRestoreProblems` reports them.
  let restoreProblems: Issue[] = [];
  const restored = documents
    .restore()
    .then((problems) => {
      restoreProblems = problems;
    })
    .catch(() => undefined);
  const newId = () => crypto.randomUUID();
  // Built-in packs and the packs installed in IndexedDB; the workspace and packs managers share the one library.
  const packs = createPackLibrary({
    builtIns: builtInPacks,
    storage: createIndexedDbStorage("carbonara-packs"),
    loadModule,
    ...(isolate && { isolate }),
  });

  const dispatch = createDispatcher(managers, {
    workspace: createWorkspaceManager({ documents, packs, events: bus, newId, restoreProblems: () => restoreProblems }),
    editing: createEditingManager({ documents, events: bus, newId }),
    packs: createPacksManager({ library: packs, bus }),
    analysis: createAnalysisManager({ bus, documents, packs }),
  });
  transport.listen(async (message) => {
    await restored;
    transport.send(await dispatch(message as Request));
  });
}
