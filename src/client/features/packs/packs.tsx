// The packs feature's entry: a top-bar button opening the pack manager, and installing a .cpack dropped anywhere
// on the app or picked in the manager, after the trust prompt.
import { useEffect, useEffectEvent, useState } from "react";
import { useConnector } from "../../core/connector";
import { isPackFile } from "./pack-files";
import { PackManager } from "./pack-manager";
import { TrustPrompt, type PendingInstall } from "./trust-prompt";
import { usePacks } from "./use-packs";

export function Packs() {
  const connector = useConnector();
  const packs = usePacks();
  const [managerOpen, setManagerOpen] = useState(false);
  const [pending, setPending] = useState<PendingInstall>();
  const dragging = useFileDrop(offer);

  async function offer(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspection = await connector.packs.inspectPack({ bytes });
    setPending({ fileName: file.name, bytes, inspection, installing: false, installIssues: [] });
  }

  async function install(current: PendingInstall) {
    setPending({ ...current, installing: true });
    const result = await connector.packs.installPack({ bytes: current.bytes });
    setPending(result.ok ? undefined : { ...current, installing: false, installIssues: result.error });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setManagerOpen(true)}
        aria-label="Game packs"
        title="Game packs"
        className="grid size-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-4"
      >
        <PackIcon />
      </button>
      {managerOpen && !pending && (
        <PackManager packs={packs} onInstallFile={(file) => void offer(file)} onClose={() => setManagerOpen(false)} />
      )}
      {pending && (
        <TrustPrompt
          pending={pending}
          installed={packs ?? []}
          onInstall={() => void install(pending)}
          onCancel={() => setPending(undefined)}
        />
      )}
      {dragging && <DropHint />}
    </>
  );
}

/** Calls `onDrop` with each .cpack dropped on the window; true while files are dragged over it. */
function useFileDrop(onDrop: (file: File) => void): boolean {
  const [depth, setDepth] = useState(0);
  const dropped = useEffectEvent(onDrop);

  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent) => hasFiles(event) && setDepth((value) => value + 1);
    const leave = (event: DragEvent) => hasFiles(event) && setDepth((value) => Math.max(0, value - 1));
    const over = (event: DragEvent) => hasFiles(event) && event.preventDefault();
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); // or the browser opens the file
      setDepth(0);
      for (const file of event.dataTransfer?.files ?? []) if (isPackFile(file)) dropped(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return depth > 0;
}

function DropHint() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center bg-canvas/60 backdrop-blur-glass">
      <div className="rounded-xl border-2 border-dashed border-accent bg-glass px-10 py-8 text-center shadow-overlay">
        <p className="text-lg font-medium text-fg">Drop a .cpack to install it</p>
        <p className="text-sm text-fg-muted">You'll see what it is before anything is installed.</p>
      </div>
    </div>
  );
}

function PackIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M8 1.75 13.75 4.75v6.5L8 14.25l-5.75-3V4.75L8 1.75Z" />
      <path d="M2.25 4.75 8 7.75l5.75-3M8 7.75v6.5" />
    </svg>
  );
}
