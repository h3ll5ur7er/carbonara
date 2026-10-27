// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { Document } from "../../../contracts/document";
import { exampleDocument } from "../../../contracts/document.fixture";
import type { Response } from "../../../contracts/rpc";
import { ConnectorProvider } from "../../core/connector";
import { ClientModelsProvider } from "../../core/models";
import { fakeConnector } from "../../scenes/fake-backend";
import { attachMcpShell, McpHost } from "./host";

it('answers the desktop shell\'s tool calls, with "active" as the tab on screen', async () => {
  const info = { id: "doc-1", name: "Iron", packId: "satisfactory", version: 1 };
  const connector = fakeConnector({
    workspace: { listDocuments: async () => [info] },
    editing: { getDocument: async () => ({ document: Document.parse(exampleDocument), version: 1 }) },
  });
  let toBridge: (message: unknown) => void = () => undefined;
  const answers: Response[] = [];
  attachMcpShell({
    transport: { send: (message) => answers.push(message as Response), listen: (listener) => (toBridge = listener) },
    connector,
  });
  render(
    <ConnectorProvider connector={connector}>
      <ClientModelsProvider>
        <McpHost />
      </ClientModelsProvider>
    </ConnectorProvider>,
  );

  // The workspace model activates the first open document once it knows them.
  await waitFor(() => {
    toBridge({ id: 1, tool: "get_graph", manager: "editing", method: "getDocument", args: { documentId: "active" } });
    expect(answers.at(-1)).toMatchObject({ ok: true, value: { id: "doc-1", name: "Iron", version: 1 } });
  });
});
