// Shown before a third-party pack is installed: which pack it is, by id, version and hash, because it contains code.
import type { CSSProperties } from "react";
import type { Issue } from "../../../contracts/issues";
import type { PackInfo, PackInspection } from "../../../contracts/managers";
import { describeIssue } from "../../../utilities/issues";
import { buttonStyles, Modal } from "./modal";

export interface PendingInstall {
  fileName: string;
  bytes: Uint8Array<ArrayBuffer>;
  inspection: PackInspection;
  installing: boolean;
  /** Problems found while installing, such as a plugin that doesn't load. */
  installIssues: Issue[];
}

export function TrustPrompt({
  pending,
  installed,
  onInstall,
  onCancel,
}: {
  pending: PendingInstall;
  installed: PackInfo[];
  onInstall: () => void;
  onCancel: () => void;
}) {
  const { manifest, hash } = pending.inspection;
  const issues = [...pending.inspection.issues, ...pending.installIssues];
  const replaces = manifest && installed.find((pack) => pack.manifest.id === manifest.id);

  if (issues.length > 0) {
    return (
      <Modal title="This pack can't be installed" description={pending.fileName} onClose={onCancel}>
        <ul className="flex max-h-80 flex-col gap-1 overflow-auto rounded-md bg-surface-1 p-3 font-mono text-xs break-words text-fg">
          {issues.map((issue, index) => (
            <li key={index}>{describeIssue(issue)}</li>
          ))}
        </ul>
        <footer className="flex justify-end">
          <button type="button" autoFocus onClick={onCancel} className={buttonStyles.secondary}>
            Close
          </button>
        </footer>
      </Modal>
    );
  }

  return (
    <Modal
      title="Install this pack?"
      description="Packs contain code that runs inside Carbonara. Install only packs from people you trust."
      onClose={onCancel}
    >
      {manifest && (
        <div
          className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4 shadow-sm"
          style={{ "--pack-accent": manifest.theme?.accent } as CSSProperties}
        >
          <div className="flex items-baseline gap-2">
            <span className="size-2 shrink-0 self-center rounded-full bg-accent" aria-hidden />
            <span className="text-base font-semibold">{manifest.name}</span>
            <span className="font-mono text-sm text-fg-muted">{manifest.version}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-fg-subtle">Id</dt>
            <dd className="font-mono">{manifest.id}</dd>
            {manifest.game && (
              <>
                <dt className="text-fg-subtle">Game</dt>
                <dd>
                  {manifest.game.name}
                  {manifest.game.version && ` ${manifest.game.version}`}
                </dd>
              </>
            )}
            <dt className="text-fg-subtle">File</dt>
            <dd className="break-all">{pending.fileName}</dd>
            <dt className="text-fg-subtle">SHA-256</dt>
            <dd className="font-mono text-xs leading-5 break-all text-fg-muted">{hash}</dd>
          </dl>
        </div>
      )}
      {replaces && (
        <p className="text-sm text-fg-muted">
          Replaces {replaces.builtIn ? "the built-in" : "the installed"} {replaces.manifest.name}{" "}
          <span className="font-mono">{replaces.manifest.version}</span>.
        </p>
      )}
      <footer className="flex justify-end gap-2">
        <button type="button" autoFocus onClick={onCancel} className={buttonStyles.secondary}>
          Cancel
        </button>
        <button type="button" disabled={pending.installing} onClick={onInstall} className={buttonStyles.primary}>
          {pending.installing ? "Installing…" : "Install"}
        </button>
      </footer>
    </Modal>
  );
}
