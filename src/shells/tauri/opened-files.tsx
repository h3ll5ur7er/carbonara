// Files opened with the desktop app (a double-click, "Open with", a second launch): factories open as documents,
// packs go through the same trust prompt as a dropped .cpack. The Rust shell keeps them until they're taken, so
// files that arrive before the web app is ready wait (src-tauri/src/opened.rs).
import { useEffect, useEffectEvent, useState } from "react";
import { useConnector } from "../../client/core/connector";
import { documentActions } from "../../client/features/documents/actions";
import { isPackFile } from "../../client/features/packs/pack-files";
import { TrustPrompt, type PendingInstall } from "../../client/features/packs/trust-prompt";
import { usePacks } from "../../client/features/packs/use-packs";
import { errorMessage, toast } from "../../client/shell/toasts";
import { pickedFile, type FileContents } from "../../platforms/tauri/files";

export interface OpenedFilesProps {
  /** The files that arrived since the last call. */
  take: () => Promise<FileContents[]>;
  /** Calls `listener` whenever files arrive; returns a function that stops it. */
  onOpened: (listener: () => void) => () => void;
}

/** Render after the app, so the File actions are wired up when the first files arrive. */
export function OpenedFiles({ take, onOpened }: OpenedFilesProps) {
  const connector = useConnector();
  const packs = usePacks();
  // Packs wait their turn: one trust prompt at a time.
  const [packQueue, setPackQueue] = useState<PendingInstall[]>([]);

  const receive = useEffectEvent(async (opened: FileContents[]) => {
    for (const contents of opened) {
      try {
        const file = pickedFile(contents);
        if (!isPackFile(file)) {
          documentActions.importFile(file);
          continue;
        }
        const inspection = await connector.packs.inspectPack({ bytes: file.bytes });
        const pending = { fileName: file.name, bytes: file.bytes, inspection, installing: false, installIssues: [] };
        setPackQueue((queue) => [...queue, pending]);
      } catch (error) {
        toast({ title: `Couldn't open ${contents.name}`, description: errorMessage(error), tone: "error" });
      }
    }
  });

  useEffect(() => {
    const takeAll = () =>
      void take()
        .then(receive)
        .catch((error: unknown) =>
          toast({ title: "Couldn't open the files", description: errorMessage(error), tone: "error" }),
        );
    const stop = onOpened(takeAll);
    takeAll();
    return stop;
  }, [take, onOpened]);

  const replaceFirst = (next: PendingInstall[]) => setPackQueue(([, ...rest]) => [...next, ...rest]);
  async function install(current: PendingInstall) {
    replaceFirst([{ ...current, installing: true }]);
    const result = await connector.packs.installPack({ bytes: current.bytes });
    replaceFirst(result.ok ? [] : [{ ...current, installing: false, installIssues: result.error }]);
  }

  const pending = packQueue[0];
  if (!pending) return null;
  return (
    <TrustPrompt
      pending={pending}
      installed={packs ?? []}
      onInstall={() => void install(pending)}
      onCancel={() => replaceFirst([])}
    />
  );
}
