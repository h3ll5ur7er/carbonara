// The open factories as tabs in the top bar: click to switch, × to close, + for a new one.
import { Plus, X } from "lucide-react";
import { useModels, useWorkspace } from "../../core/models";
import { IconButton } from "../../ui/button";
import { cx } from "../../ui/cx";
import { documentActions } from "./actions";

export function DocumentTabs() {
  const { workspace } = useModels();
  const documents = useWorkspace((state) => state.documents);
  const activeId = useWorkspace((state) => state.activeId);

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
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => workspace.activate(document.id)}
                className="flex h-full min-w-0 items-center gap-2 rounded-md pr-1 pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
              >
                <span
                  className={cx("size-1.5 shrink-0 rounded-full", active ? "bg-accent" : "bg-fg-faint")}
                  aria-hidden
                />
                <span className="truncate">{document.name}</span>
              </button>
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
