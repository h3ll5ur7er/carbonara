// The way back up out of a subgraph: a frosted bar at the canvas's top-left with a button up one level, the factory
// and every blueprint opened on the way (each a button back to that level), and the blueprint on screen, which a
// double-click renames. When the blueprint is placed more than once, a chip says the rates inside add up all of them.
import { ArrowUpLeft, ChevronRight, Layers } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { IconButton } from "../../ui/button";
import { Tooltip } from "../../ui/tooltip";

export interface BreadcrumbsProps {
  /** The factory, then each blueprint opened; the last is on screen. */
  crumbs: { label: string; depth: number }[];
  /** How many instances the blueprint on screen has. */
  instances: number;
  leaveShortcut?: string[] | undefined;
  /** Goes back to the graph at this depth (0 is the factory). */
  onLeaveTo(depth: number): void;
  onRename(name: string): void;
}

export function Breadcrumbs({ crumbs, instances, leaveShortcut, onLeaveTo, onRename }: BreadcrumbsProps) {
  const current = crumbs.at(-1);
  const above = crumbs.slice(0, -1);
  const [renaming, setRenaming] = useState(false);
  if (!current) return null;
  return (
    <nav
      aria-label="Subgraph"
      className="pointer-events-auto flex h-9 animate-pop-in items-center gap-0.5 rounded-lg bg-glass p-1 shadow-overlay backdrop-blur-glass"
    >
      <IconButton
        size="sm"
        label="Leave subgraph"
        shortcut={leaveShortcut}
        icon={<ArrowUpLeft />}
        onClick={() => onLeaveTo(current.depth - 1)}
      />
      <span aria-hidden className="mx-1 h-5 w-px bg-line-subtle" />
      <ol className="flex min-w-0 items-center">
        {above.map((crumb) => (
          <li key={crumb.depth} className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => onLeaveTo(crumb.depth)}
              className="h-7 max-w-40 truncate rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {crumb.label}
            </button>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-fg-faint" />
          </li>
        ))}
        <li aria-current="page" className="flex min-w-0 items-center gap-1.5 pr-1 pl-2">
          <Layers aria-hidden className="size-3.5 shrink-0 text-accent-fg" />
          {renaming ? (
            <NameField
              initial={current.label}
              onDone={(name) => {
                setRenaming(false);
                if (name && name !== current.label) onRename(name);
              }}
            />
          ) : (
            <Tooltip content="Double-click to rename">
              <span
                tabIndex={0}
                onDoubleClick={() => setRenaming(true)}
                onKeyDown={(event) => event.key === "F2" && setRenaming(true)}
                className="max-w-56 truncate rounded-xs text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                {current.label}
              </span>
            </Tooltip>
          )}
        </li>
      </ol>
      {instances > 1 && (
        <Tooltip content={`The rates inside add up all ${instances} instances of this blueprint`}>
          <span
            tabIndex={0}
            className="mr-1 ml-1.5 shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {instances} instances
          </span>
        </Tooltip>
      )}
    </nav>
  );
}

/** The blueprint's name, edited in place: Enter or leaving keeps it, Escape drops it. */
function NameField({ initial, onDone }: { initial: string; onDone(name: string | undefined): void }) {
  const [name, setName] = useState(initial);
  const done = useRef(false);
  const finish = (value: string | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") finish(name.trim());
    else if (event.key === "Escape") finish(undefined);
  };
  return (
    <input
      autoFocus
      aria-label="Blueprint name"
      value={name}
      size={Math.max(name.length, 8)}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setName(event.currentTarget.value)}
      onBlur={() => finish(name.trim())}
      onKeyDown={onKeyDown}
      className="h-6 rounded-xs bg-surface-1 px-1 text-sm font-semibold text-fg outline-none inset-ring inset-ring-accent"
    />
  );
}
