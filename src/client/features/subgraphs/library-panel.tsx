// The blueprint library in the left panel: every blueprint of the document as a card with what goes in and
// what comes out. Drag one onto the canvas (it follows as a ghost and lands where it's let go), or click it and
// then click where it goes; Enter places it in the middle of the view. Each card's menu (right-click, or its ⋯
// button) renames, duplicates and deletes the blueprint; deleting one that's placed asks first.
import { ArrowRight, Copy, Ellipsis, GripVertical, Layers, Pencil, Trash2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { LocalId } from "../../../contracts/document";
import { ItemChip } from "../../canvas/parts";
import { Button, IconButton } from "../../ui/button";
import { Dialog, DialogClose, DialogContent } from "../../ui/dialog";
import { Kbd } from "../../ui/kbd";
import { cx } from "../../ui/cx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "../../ui/menu";
import type { LibraryEntry } from "./library";

/** Pointer travel, in pixels, after which a press on a card is a drag. */
const DRAG = 4;

export interface BlueprintLibraryProps {
  entries: LibraryEntry[];
  /** The blueprint following the pointer, if any. */
  placing: LocalId | null;
  /** Keys of "Collapse into subgraph", for the hint while there are no blueprints. */
  collapseKeys?: string[] | undefined;
  onPick(blueprint: LocalId): void;
  onPlaceInView(blueprint: LocalId): void;
  /** A drag let go of it over the canvas, at this point on screen. */
  onDrop(blueprint: LocalId, screen: { x: number; y: number }): void;
  onCancel(): void;
  /** What the cards' menus do; without it, they have none. */
  manage?: BlueprintManagement | undefined;
}

/** Edits the library's cards make, each one step in the history. */
export interface BlueprintManagement {
  rename(blueprint: LocalId, name: string): void;
  duplicate(blueprint: LocalId): void;
  /** Deletes the blueprints and every instance of them. */
  remove(blueprints: LocalId[]): void;
}

export function BlueprintLibrary({
  entries,
  placing,
  collapseKeys,
  onPick,
  onPlaceInView,
  onDrop,
  onCancel,
  manage,
}: BlueprintLibraryProps) {
  const [renaming, setRenaming] = useState<LocalId | null>(null);
  const [deleting, setDeleting] = useState<LibraryEntry | null>(null);

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 pb-12 text-center">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-fg-subtle inset-ring inset-ring-line-subtle">
          <Layers className="size-4.5" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-medium text-fg-muted">No blueprints yet</p>
          <p className="text-xs text-fg-subtle">
            Select machines and collapse them into a subgraph to reuse it anywhere.
          </p>
          {collapseKeys && <Kbd keys={collapseKeys} />}
        </div>
      </div>
    );
  }

  /** A press that turns into a drag places the blueprint where it's let go over the canvas. */
  const onPointerDown = (entry: LibraryEntry) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !entry.placeable) return;
    const start = { x: event.clientX, y: event.clientY };
    onPick(entry.id);
    const onUp = (up: globalThis.PointerEvent) => {
      window.removeEventListener("pointerup", onUp);
      if (Math.hypot(up.clientX - start.x, up.clientY - start.y) <= DRAG) return; // a click: follow until the next
      // Let go over empty canvas: it lands there. Anywhere else: never mind.
      const target = document.elementFromPoint(up.clientX, up.clientY);
      if (target?.closest(".react-flow__pane")) onDrop(entry.id, { x: up.clientX, y: up.clientY });
      else onCancel();
    };
    window.addEventListener("pointerup", onUp);
  };

  /** Placed blueprints ask first; one that nothing places goes straight away (undo brings it back). */
  const askToDelete = (entry: LibraryEntry) => {
    if (entry.instances === 0) manage?.remove([entry.id]);
    else setDeleting(entry);
  };
  const unplaced = entries.filter((entry) => entry.instances === 0);

  return (
    <section aria-label="Blueprints" className="flex flex-col gap-1 p-2">
      <header className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-1.5">
        <h3 className="text-2xs font-semibold tracking-wide text-fg-subtle uppercase">Blueprints</h3>
        <span className="font-mono text-2xs text-fg-faint">{entries.length}</span>
      </header>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => {
          const actions =
            manage &&
            cardActions({
              onRename: () => setRenaming(entry.id),
              onDuplicate: () => manage.duplicate(entry.id),
              onDelete: () => askToDelete(entry),
            });
          const card =
            renaming === entry.id ? (
              <NameField
                initial={entry.name}
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== entry.name) manage?.rename(entry.id, name);
                }}
              />
            ) : (
              <button
                type="button"
                disabled={!entry.placeable}
                aria-pressed={placing === entry.id}
                title={entry.placeable ? "Drag onto the canvas, or click and then click where it goes" : undefined}
                onPointerDown={onPointerDown(entry)}
                // Enter or Space (a click without a pointer): straight into the middle of the view.
                onClick={(event) => event.detail === 0 && onPlaceInView(entry.id)}
                className={cx(
                  "group flex w-full touch-none items-start gap-3 rounded-lg p-2.5 text-left transition-colors select-none",
                  "cursor-grab hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing",
                  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
                  placing === entry.id && "bg-accent-soft ring-1 ring-accent ring-inset hover:bg-accent-soft",
                )}
              >
                <CardBody entry={entry} />
                <GripVertical
                  aria-hidden
                  className="mt-1 size-4 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 group-disabled:hidden"
                />
              </button>
            );
          return (
            <li key={entry.id} className="group/card relative">
              {actions && renaming !== entry.id ? (
                <ContextMenu>
                  <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
                  <ContextMenuContent>{actions.context}</ContextMenuContent>
                </ContextMenu>
              ) : (
                card
              )}
              {actions && renaming !== entry.id && (
                <Menu>
                  <MenuTrigger asChild>
                    <IconButton
                      size="sm"
                      tooltip={false}
                      label={`Actions for ${entry.name}`}
                      icon={<Ellipsis />}
                      className={cx(
                        "absolute right-1.5 bottom-1.5 opacity-0 transition-opacity",
                        "group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100",
                      )}
                    />
                  </MenuTrigger>
                  <MenuContent align="end">{actions.dropdown}</MenuContent>
                </Menu>
              )}
            </li>
          );
        })}
      </ul>
      {manage && unplaced.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="mx-1 mt-1 self-start"
          onClick={() => manage.remove(unplaced.map((entry) => entry.id))}
        >
          <Trash2 /> Delete {unplaced.length} unplaced {unplaced.length === 1 ? "blueprint" : "blueprints"}
        </Button>
      )}
      <p className="px-2 pt-2 text-2xs text-fg-faint">
        Drag a blueprint onto the canvas. Every copy shares its insides: change one, and all of them follow.
      </p>
      {manage && (
        <DeleteDialog
          entry={deleting}
          onClose={() => setDeleting(null)}
          onDelete={(entry) => {
            setDeleting(null);
            manage.remove([entry.id]);
          }}
        />
      )}
    </section>
  );
}

/** A card's name, what it is and what flows through it. */
function CardBody({ entry }: { entry: LibraryEntry }) {
  return (
    <>
      <span
        aria-hidden
        className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-fg ring-1 ring-accent-soft ring-inset"
      >
        <Layers className="size-4.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold tracking-tight text-fg">{entry.name}</span>
        <span className="truncate text-2xs text-fg-subtle">
          {entry.placeable ? placed(entry.instances) : "Can't go inside itself"}
          <span className="px-1 text-fg-faint">·</span>
          {entry.nodes} {entry.nodes === 1 ? "node" : "nodes"}
        </span>
        <span className="sr-only">
          Takes {entry.inputs.map((item) => item.name).join(", ") || "nothing"}; makes{" "}
          {entry.outputs.map((item) => item.name).join(", ") || "nothing"}.
        </span>
        {(entry.inputs.length > 0 || entry.outputs.length > 0) && (
          <span aria-hidden className="mt-1.5 flex flex-wrap items-center gap-1">
            {entry.inputs.map((item, index) => (
              <ItemChip key={`in-${index}`} item={item} size="sm" />
            ))}
            <ArrowRight aria-hidden className="mx-0.5 size-3 text-fg-faint" />
            {entry.outputs.map((item, index) => (
              <ItemChip key={`out-${index}`} item={item} size="sm" />
            ))}
          </span>
        )}
      </span>
    </>
  );
}

/** The card's menu items, for its context menu and for its ⋯ button's dropdown. */
function cardActions({
  onRename,
  onDuplicate,
  onDelete,
}: {
  onRename(): void;
  onDuplicate(): void;
  onDelete(): void;
}): { context: ReactNode; dropdown: ReactNode } {
  return {
    context: (
      <>
        <ContextMenuItem icon={<Pencil />} onSelect={onRename}>
          Rename…
        </ContextMenuItem>
        <ContextMenuItem icon={<Copy />} onSelect={onDuplicate}>
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} onSelect={onDelete}>
          Delete…
        </ContextMenuItem>
      </>
    ),
    dropdown: (
      <>
        <MenuItem icon={<Pencil />} onSelect={onRename}>
          Rename…
        </MenuItem>
        <MenuItem icon={<Copy />} onSelect={onDuplicate}>
          Duplicate
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} onSelect={onDelete}>
          Delete…
        </MenuItem>
      </>
    ),
  };
}

/** Deleting a placed blueprint takes its instances with it: say so, and how many, before it happens. */
function DeleteDialog({
  entry,
  onClose,
  onDelete,
}: {
  entry: LibraryEntry | null;
  onClose(): void;
  onDelete(entry: LibraryEntry): void;
}) {
  const instances = entry?.instances ?? 0;
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      {entry && (
        <DialogContent
          title={`Delete “${entry.name}”?`}
          description={
            `It's placed ${instances === 1 ? "once" : `${instances} times`}. Deleting it removes ` +
            `${instances === 1 ? "that instance" : `all ${instances} instances`} and their flows too. Undo brings ` +
            "everything back."
          }
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => onDelete(entry)}>
                <Trash2 /> Delete blueprint and {instances === 1 ? "instance" : `${instances} instances`}
              </Button>
            </>
          }
        />
      )}
    </Dialog>
  );
}

/** The blueprint's name, edited in place on its card: Enter or leaving keeps it, Escape drops it. */
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
    <div className="flex items-center gap-3 rounded-lg bg-surface-3 p-2.5">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-fg ring-1 ring-accent-soft ring-inset"
      >
        <Layers className="size-4.5" />
      </span>
      <input
        autoFocus
        aria-label="Blueprint name"
        value={name}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => finish(name.trim())}
        onKeyDown={onKeyDown}
        className="h-7 min-w-0 flex-1 rounded-sm bg-surface-1 px-1.5 text-sm font-semibold text-fg outline-none inset-ring inset-ring-accent"
      />
    </div>
  );
}

function placed(instances: number): string {
  if (instances === 0) return "Not placed";
  return instances === 1 ? "Placed once" : `Placed ${instances} times`;
}
