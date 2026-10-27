// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConnectorProvider, type Connector } from "../../client/core/connector";
import { setDocumentActions, type DocumentActions } from "../../client/features/documents/actions";
import { useToasts } from "../../client/shell/toasts";
import type { PackInspection } from "../../contracts/managers";
import { ok } from "../../contracts/result";
import type { FileContents } from "../../platforms/tauri/files";
import { OpenedFiles } from "./opened-files";

const inspection = {
  manifest: { id: "demo", name: "Demo Works", version: "1.0.0" },
  hash: "ab12",
  issues: [],
} as unknown as PackInspection;

function setUp(batches: FileContents[][]) {
  const installPack = vi.fn(async () => ok(undefined));
  const connector = {
    on: () => () => undefined,
    packs: { listPacks: async () => [], inspectPack: vi.fn(async () => inspection), installPack },
  } as unknown as Connector;
  const importFile = vi.fn();
  setDocumentActions({ importFile } as unknown as DocumentActions);
  let opened = () => {};
  const take = vi.fn(async () => batches.shift() ?? []);
  render(
    <ConnectorProvider connector={connector}>
      <OpenedFiles
        take={take}
        onOpened={(listener) => {
          opened = listener;
          return () => undefined;
        }}
      />
    </ConnectorProvider>,
  );
  return { importFile, installPack, take, open: () => opened() };
}

beforeAll(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
  setDocumentActions(null);
  useToasts.setState({ toasts: [] });
});

describe("files opened with the desktop app", () => {
  it("opens the factories the app was started with", async () => {
    const { importFile } = setUp([[{ name: "Iron.carbonara", bytes: [1, 2] }]]);
    await waitFor(() =>
      expect(importFile).toHaveBeenCalledWith({ name: "Iron.carbonara", bytes: new Uint8Array([1, 2]) }),
    );
  });

  it("opens files that arrive while it runs", async () => {
    const { importFile, open } = setUp([[], [{ name: "Copper.carbonara", bytes: [3] }]]);
    await waitFor(() => expect(importFile).not.toHaveBeenCalled());
    open();
    await waitFor(() => expect(importFile).toHaveBeenCalledOnce());
  });

  it("asks before it installs a pack, one pack at a time", async () => {
    const { installPack } = setUp([
      [
        { name: "demo.cpack", bytes: [5] },
        { name: "other.cpack", bytes: [6] },
      ],
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(installPack).toHaveBeenCalledWith({ bytes: new Uint8Array([5]) }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install" })).toBeNull());
    expect(installPack).toHaveBeenCalledOnce();
  });

  it("says which file couldn't be read", async () => {
    setUp([[{ name: "Iron.carbonara", error: "Permission denied" }]]);
    await waitFor(() =>
      expect(useToasts.getState().toasts.map((toast) => toast.title)).toEqual(["Couldn't open Iron.carbonara"]),
    );
  });
});
