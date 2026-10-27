// Workspace manager: the use cases around open documents (create, open, import, export, close).
// Wave 1 fills in the document use cases (CARB-35); for now it answers pings.
import type { ManagerImplementation } from "../contracts/managers";

export function createWorkspaceManager(): Partial<ManagerImplementation<"workspace">> {
  return {
    ping: async () => "pong",
  };
}
