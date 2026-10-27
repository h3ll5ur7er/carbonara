// The client's only way to the managers: a typed proxy over the RPC envelope, provided through React context.
import { createContext, useContext, type ReactNode } from "react";
import { managers, type Backend, type Events } from "../../contracts/managers";
import { connect, type Subscribable, type Transport } from "../../utilities/rpc";

export type Connector = Backend & Subscribable<Events>;

export function createConnector(transport: Transport): Connector {
  return connect<typeof managers, Events>(managers, transport);
}

const ConnectorContext = createContext<Connector | null>(null);

export function ConnectorProvider({ connector, children }: { connector: Connector; children: ReactNode }) {
  return <ConnectorContext value={connector}>{children}</ConnectorContext>;
}

export function useConnector(): Connector {
  const connector = useContext(ConnectorContext);
  if (!connector) throw new Error("useConnector needs a ConnectorProvider");
  return connector;
}
