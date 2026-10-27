// Composition root of the web backend: wires managers to their access components and platforms,
// and serves them over a transport (the backend worker's message port).
import { managers, type Events } from "../../contracts/managers";
import type { EventMessage, Request } from "../../contracts/rpc";
import { createAnalysisManager } from "../../managers/analysis";
import { createWorkspaceManager } from "../../managers/workspace";
import { createEventBus } from "../../utilities/events";
import { createDispatcher, type Transport } from "../../utilities/rpc";

export function startBackend(transport: Transport): void {
  const bus = createEventBus<Events>();
  bus.subscribeAll((event, payload) => transport.send({ event, payload } satisfies EventMessage));

  // TODO(CARB-15): inject the documents access component's DocumentStore (`documents`) and the packs
  // access component's PackStore here once they're wired into this file; until then nothing is open.
  const documents = { get: () => undefined };
  const packs = { get: async () => undefined };

  const dispatch = createDispatcher(managers, {
    workspace: createWorkspaceManager(),
    analysis: createAnalysisManager({ bus, documents, packs }),
  });
  transport.listen(async (message) => transport.send(await dispatch(message as Request)));
}
