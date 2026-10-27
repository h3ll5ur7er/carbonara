// A connector for scenes: the real RPC envelope and argument validation, in front of fake manager methods.
import { managers, type Managers } from "../../contracts/managers";
import type { Request } from "../../contracts/rpc";
import { createDispatcher } from "../../utilities/rpc";
import { createConnector, type Connector } from "../core/connector";

export function fakeConnector(implementations: Parameters<typeof createDispatcher<Managers>>[1]): Connector {
  const dispatch = createDispatcher(managers, implementations);
  const listeners: ((message: unknown) => void)[] = [];
  return createConnector({
    send: (message) =>
      void dispatch(message as Request).then((response) => listeners.forEach((listener) => listener(response))),
    listen: (listener) => listeners.push(listener),
  });
}
