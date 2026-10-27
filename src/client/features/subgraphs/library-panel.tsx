// The blueprint library in the left panel: every blueprint of the document as a card with what goes in and
// what comes out. Drag one onto the canvas (it follows as a ghost and lands where it's let go), or click it and
// then click where it goes; Enter places it in the middle of the view.
import { ArrowRight, GripVertical, Layers } from "lucide-react";
import type { PointerEvent } from "react";
import type { LocalId } from "../../../contracts/document";
import { ItemChip } from "../../canvas/parts";
import { Kbd } from "../../ui/kbd";
import { cx } from "../../ui/cx";
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
}

export function BlueprintLibrary({
  entries,
  placing,
  collapseKeys,
  onPick,
  onPlaceInView,
  onDrop,
  onCancel,
}: BlueprintLibraryProps) {
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

  return (
    <section aria-label="Blueprints" className="flex flex-col gap-1 p-2">
      <header className="flex items-baseline justify-between px-2 pt-1 pb-1.5">
        <h3 className="text-2xs font-semibold tracking-wide text-fg-subtle uppercase">Blueprints</h3>
        <span className="font-mono text-2xs text-fg-faint">{entries.length}</span>
      </header>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => (
          <li key={entry.id}>
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
              <GripVertical
                aria-hidden
                className="mt-1 size-4 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 group-disabled:hidden"
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="px-2 pt-2 text-2xs text-fg-faint">
        Drag a blueprint onto the canvas. Every copy shares its insides: change one, and all of them follow.
      </p>
    </section>
  );
}

function placed(instances: number): string {
  if (instances === 0) return "Not placed";
  return instances === 1 ? "Placed once" : `Placed ${instances} times`;
}
