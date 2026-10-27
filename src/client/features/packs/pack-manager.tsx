// The pack manager panel: the packs Carbonara has, removing installed ones, installing from a file.
import { useRef, type CSSProperties } from "react";
import type { PackInfo } from "../../../contracts/managers";
import { useConnector } from "../../core/connector";
import { buttonStyles, Modal } from "./modal";
import { shortHash } from "./pack-files";

export function PackManager({
  packs,
  onInstallFile,
  onClose,
}: {
  packs: PackInfo[] | undefined;
  onInstallFile: (file: File) => void;
  onClose: () => void;
}) {
  const connector = useConnector();
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <Modal
      title="Game packs"
      description="Each pack adds a game. Drop a .cpack file anywhere to install one."
      onClose={onClose}
    >
      <ul className="flex flex-col gap-1">
        {packs?.map((pack) => (
          <li
            key={pack.manifest.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-3"
            style={{ "--pack-accent": pack.manifest.theme?.accent } as CSSProperties}
          >
            <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-base font-medium">{pack.manifest.name}</span>
                <span className="font-mono text-xs text-fg-muted">{pack.manifest.version}</span>
              </span>
              <span className="truncate font-mono text-2xs text-fg-subtle">
                {pack.manifest.id} · {shortHash(pack.hash)}
              </span>
            </div>
            {pack.builtIn ? (
              <span className="rounded-sm bg-surface-3 px-2 py-0.5 text-2xs font-medium text-fg-muted">Built in</span>
            ) : (
              <button
                type="button"
                onClick={() => void connector.packs.removePack({ packId: pack.manifest.id })}
                className={buttonStyles.quiet}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <footer className="flex justify-between gap-2">
        <button type="button" onClick={() => fileInput.current?.click()} className={buttonStyles.secondary}>
          Install from file…
        </button>
        <button type="button" onClick={onClose} className={buttonStyles.quiet}>
          Done
        </button>
      </footer>
      <input
        ref={fileInput}
        type="file"
        accept=".cpack"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onInstallFile(file);
        }}
      />
    </Modal>
  );
}
