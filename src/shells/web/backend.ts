// Composition root of the web backend: wires managers to their access components and platforms,
// and serves them over a transport (the backend worker's message port).
import { createAutosavedDocumentStore } from "../../access/documents/autosave";
import type { PackStore } from "../../contracts/access";
import { managers, type Events } from "../../contracts/managers";
import type { EventMessage, Request } from "../../contracts/rpc";
import { createEditingManager } from "../../managers/editing";
import { createWorkspaceManager } from "../../managers/workspace";
import { createIndexedDbStorage } from "../../platforms/web/indexeddb";
import { createEventBus } from "../../utilities/events";
import { createDispatcher, type Transport } from "../../utilities/rpc";

export function startBackend(transport: Transport): void {
  const bus = createEventBus<Events>();
  bus.subscribeAll((event, payload) => transport.send({ event, payload } satisfies EventMessage));

  const documents = createAutosavedDocumentStore(createIndexedDbStorage("carbonara-documents"));
  // Reopen last session's documents before answering. Without IndexedDB (private windows) we start empty;
  // documents that can't be loaded stay saved, and reporting them waits for a UI.
  const restored = documents.restore().catch(() => []);
  const newId = () => crypto.randomUUID();
  // Stand-in until the packs access component exists (CARB-25): no packs, so createDocument refuses every pack.
  const packs: PackStore = { list: async () => [], get: async () => undefined };

  const dispatch = createDispatcher(managers, {
    workspace: createWorkspaceManager({ documents, packs, events: bus, newId }),
    editing: createEditingManager({ documents, events: bus, newId }),
  });
  transport.listen(async (message) => {
    await restored;
    transport.send(await dispatch(message as Request));
  });
}
