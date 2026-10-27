// The open factories as tabs in the top bar: click to switch, double-click to rename, × to close, + for a new one.
import { Plus, X } from "lucide-react";
import { useRef } from "react";
import { useModels, useWorkspace } from "../../core/models";
import { IconButton } from "../../ui/button";
import { cx } from "../../ui/cx";
import { documentActions } from "./actions";
import { useRenaming } from "./new-document-store";

export function DocumentTabs() {
  const { workspace } = useModels();
  const documents = useWorkspace((state) => state.documents);
  const activeId = useWorkspace((state) => state.activeId);
  const renamingId = useRenaming((state) => state.documentId);

  return (
    <nav aria-label="Factories" className="flex min-w-0 items-center gap-1">
      <div role="tablist" aria-label="Open factories" className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {documents.map((document) => {
          const active = document.id === activeId;
          return (
            <div
              key={document.id}
              className={cx(
                "group flex h-8 max-w-56 shrink-0 items-center rounded-md text-sm font-medium transition-colors",
                active ? "bg-surface-3 text-fg shadow-sm" : "text-fg-subtle hover:bg-surface-2 hover:text-fg-muted",
              )}
            >
              {renamingId === document.id ? (
                <TabNameField documentId={document.id} name={document.name} active={active} />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => workspace.activate(document.id)}
                  onDoubleClick={() => documentActions.renameDocument(document.id)}
                  className="flex h-full min-w-0 items-center gap-2 rounded-md pr-1 pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                >
                  <TabDot active={active} />
                  <span className="truncate">{document.name}</span>
                </button>
              )}
              <IconButton
                label={`Close ${document.name}`}
                icon={<X />}
                size="sm"
                tooltip={false}
                onClick={() => documentActions.closeDocument(document.id)}
                className={cx(
                  "mr-0.5 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  active && "opacity-60",
                )}
              />
            </div>
          );
        })}
      </div>
      <IconButton label="New factory" icon={<Plus />} size="sm" onClick={documentActions.newDocument} />
    </nav>
  );
}

function TabDot({ active }: { active: boolean }) {
  return <span className={cx("size-1.5 shrink-0 rounded-full", active ? "bg-accent" : "bg-fg-faint")} aria-hidden />;
}

/** The tab's name, edited in place: Enter or leaving the field renames, Escape keeps the old name. */
function TabNameField({ documentId, name, active }: { documentId: string; name: string; active: boolean }) {
  const cancelled = useRef(false);
  return (
    <span className="flex h-full min-w-0 items-center gap-2 pr-1 pl-3">
      <TabDot active={active} />
      <input
        aria-label="Factory name"
        defaultValue={name}
        // Selected on mount: the person is about to type a new name.
        ref={(input) => input?.select()}
        maxLength={120}
        size={Math.max(8, Math.min(name.length + 2, 28))}
        onKeyDown={(event) => {
          // Keys typed here are the name's, not the app's shortcuts.
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
          else if (event.key === "Escape") {
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
        onBlur={(event) =>
          documentActions.commitRename(documentId, cancelled.current ? name : event.currentTarget.value)
        }
        className={cx(
          "-ml-1 h-6 min-w-0 rounded-sm bg-surface-2 px-1 text-sm font-medium text-fg",
          "inset-ring inset-ring-accent ring-3 ring-accent-soft outline-none",
        )}
      />
    </span>
  );
}
