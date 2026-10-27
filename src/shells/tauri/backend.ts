// Composition root of the desktop backend: the web backend's managers (src/shells/web/backend.ts), with storage
// in the app data folder instead of IndexedDB. Runs in the backend worker and reaches the Rust shell's commands
// through `invoke`, which the main thread serves (main.tsx).
import builtInPacks from "virtual:built-in-packs";
import { createAutosavedDocumentStore } from "../../access/documents/autosave";
import { createPackLibrary } from "../../access/packs/library";
import type { Issue } from "../../contracts/issues";
import { managers, type Events } from "../../contracts/managers";
import type { EventMessage, Request } from "../../contracts/rpc";
import { createAnalysisManager } from "../../managers/analysis";
import { createEditingManager } from "../../managers/editing";
import { createPacksManager } from "../../managers/packs";
import { createWorkspaceManager } from "../../managers/workspace";
import type { Invoke } from "../../platforms/tauri/invoke";
import { createTauriStorage } from "../../platforms/tauri/key-value";
import { loadModule } from "../../platforms/web/module-loader";
import { createEventBus } from "../../utilities/events";
import { createDispatcher, type Transport } from "../../utilities/rpc";

export function startDesktopBackend(transport: Transport, invoke: Invoke): void {
  const bus = createEventBus<Events>();
  bus.subscribeAll((event, payload) => transport.send({ event, payload } satisfies EventMessage));

  const documents = createAutosavedDocumentStore(createTauriStorage("carbonara-documents", invoke));
  // Reopen last session's documents before answering; documents that can't be loaded stay saved, and
  // `workspace.getRestoreProblems` reports them.
  let restoreProblems: Issue[] = [];
  const restored = documents
    .restore()
    .then((problems) => {
      restoreProblems = problems;
    })
    .catch(() => undefined);
  const newId = () => crypto.randomUUID();
  // The webview runs plugins like a browser does: from a Blob URL in the backend worker.
  const packs = createPackLibrary({
    builtIns: builtInPacks,
    storage: createTauriStorage("carbonara-packs", invoke),
    loadModule,
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
