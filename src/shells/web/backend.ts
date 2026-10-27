// Composition root of the web backend: wires managers to their access components and platforms,
// and serves them over a transport (the backend worker's message port).
import { managers, type Events } from "../../contracts/managers";
import type { EventMessage, Request } from "../../contracts/rpc";
import { createWorkspaceManager } from "../../managers/workspace";
import { createEventBus } from "../../utilities/events";
import { createDispatcher, type Transport } from "../../utilities/rpc";

export function startBackend(transport: Transport): void {
  const bus = createEventBus<Events>();
  bus.subscribeAll((event, payload) => transport.send({ event, payload } satisfies EventMessage));

  const dispatch = createDispatcher(managers, {
    workspace: createWorkspaceManager(),
  });
  transport.listen(async (message) => transport.send(await dispatch(message as Request)));
}
