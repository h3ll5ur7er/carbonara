// The recipe picker: opens where a connection from a port was dropped in empty space, lists what can be
// connected there (consumers of an output, producers of an input), best first, and previews the highlighted
// recipe next to the list so alternates can be compared. Type to narrow, arrows to move, Enter to add.
import { Command } from "cmdk";
import { ArrowRight, CornerDownLeft, LogIn, LogOut, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id, PackData, RateUnit } from "../../../contracts/pack";
import { formatNumber } from "../../canvas/model/format";
import { ItemChip, Rate } from "../../canvas/parts";
import { cx } from "../../ui/cx";
import { Kbd } from "../../ui/kbd";
import { filterEntries, pickerEntries, type PickerEntry, type PickerRequest } from "./picker";

/** The panel's size in pixels, to keep it inside the canvas. */
const PANEL = { width: 560, height: 392 };
const EDGE_GAP = 8;

export interface RecipePickerProps {
  pack: PackData;
  request: PickerRequest;
  /** Nodes per recipe in the document, for ranking. */
  usage: Record<Id, number>;
  rateUnit: RateUnit;
  /** Where the drop happened, and the part of the canvas the panel may use (clear of the side panels), in pixels. */
  at: { x: number; y: number };
  bounds: { left: number; right: number; height: number };
  onPick(entry: PickerEntry): void;
  onClose(): void;
}

export function RecipePicker({ pack, request, usage, rateUnit, at, bounds, onPick, onClose }: RecipePickerProps) {
  const entries = useMemo(() => pickerEntries(pack, request, usage), [pack, request, usage]);
  const [search, setSearch] = useState("");
  const shown = useMemo(() => filterEntries(entries, search), [entries, search]);
  const [selected, setSelected] = useState(entries[0]?.id ?? "");
  const highlighted = shown.find((entry) => entry.id === selected) ?? shown[0];
  const item = entryItem(entries);

  // Producers appear left of an input port, consumers right of an output, so the panel never covers the port.
  const preferredLeft = request.side === "in" ? at.x - PANEL.width - EDGE_GAP : at.x + EDGE_GAP;
  const left = clamp(preferredLeft, bounds.left + EDGE_GAP, bounds.right - PANEL.width - EDGE_GAP);
  const top = clamp(at.y - 28, EDGE_GAP, bounds.height - PANEL.height - EDGE_GAP);

  return (
    <>
      <div className="absolute inset-0 z-20" onPointerDown={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={request.side === "out" ? "Connect a consumer" : "Connect a producer"}
        style={{ left, top, width: PANEL.width, height: PANEL.height }}
        className="absolute z-30 flex animate-pop-in flex-col overflow-hidden rounded-xl bg-glass shadow-overlay backdrop-blur-glass backdrop-saturate-150"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <Command
          label="Recipes"
          shouldFilter={false}
          loop
          value={highlighted?.id ?? ""}
          onValueChange={setSelected}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line-subtle px-4">
            <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder={request.side === "out" ? "What should use it?" : "What should make it?"}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
            />
            {item && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-3 py-0.5 pr-2.5 pl-0.5 text-xs text-fg-muted">
                <ItemChip item={item} size="sm" />
                {request.side === "out" ? "Uses" : "Makes"} {item.name}
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1">
            <Command.List className="w-64 shrink-0 overflow-y-auto border-r border-line-subtle p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">
                Nothing matches “{search}”.
              </Command.Empty>
              {shown.map((entry) => (
                <Command.Item
                  key={entry.id}
                  value={entry.id}
                  onSelect={() => onPick(entry)}
                  className={cx(
                    "group/item flex h-11 cursor-default items-center gap-2.5 rounded-md px-2 select-none",
                    "data-[selected=true]:bg-accent-soft",
                  )}
                >
                  <EntryIcon entry={entry} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-fg">{entry.title}</span>
                      {entry.kind === "recipe" && entry.alternate && <AltBadge />}
                    </span>
                    <span className="truncate text-2xs text-fg-subtle">{entrySubtitle(entry)}</span>
                  </span>
                  <CornerDownLeft
                    className="size-3.5 shrink-0 text-accent-fg opacity-0 group-data-[selected=true]/item:opacity-100"
                    aria-hidden
                  />
                </Command.Item>
              ))}
            </Command.List>
            <div className="min-w-0 flex-1 overflow-y-auto p-4">
              {highlighted && <Preview entry={highlighted} rateUnit={rateUnit} />}
            </div>
          </div>
        </Command>
        <footer className="flex shrink-0 items-center gap-4 border-t border-line-subtle bg-surface-1/40 px-4 py-2 text-2xs text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <Kbd keys={["↑", "↓"]} /> to compare
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd keys={["↵"]} /> to add
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd keys={["Esc"]} /> to cancel
          </span>
        </footer>
      </div>
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** The item the picker was opened for, from its source or sink entry. */
function entryItem(entries: PickerEntry[]) {
  for (const entry of entries) if (entry.kind !== "recipe") return entry.item;
  return undefined;
}

function entrySubtitle(entry: PickerEntry): string {
  if (entry.kind !== "recipe") {
    return entry.kind === "source" ? "Where it enters the factory" : "Where it leaves the factory";
  }
  const used = entry.uses > 0 ? ` · used ${entry.uses}×` : "";
  return `${entry.building}${used}`;
}

function EntryIcon({ entry }: { entry: PickerEntry }) {
  if (entry.kind !== "recipe") {
    const Icon = entry.kind === "source" ? LogIn : LogOut;
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-fg-subtle group-data-[selected=true]/item:text-accent-fg">
        <Icon className="size-3.5" aria-hidden />
      </span>
    );
  }
  const main = entry.outputs[0];
  return main ? <ItemChip item={main.item} size="md" /> : null;
}

function AltBadge() {
  return <span className="shrink-0 rounded-xs bg-surface-4 px-1 text-2xs font-medium text-fg-muted">Alt</span>;
}

function Preview({ entry, rateUnit }: { entry: PickerEntry; rateUnit: RateUnit }) {
  if (entry.kind !== "recipe") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <ItemChip item={entry.item} size="xl" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-fg">{entry.title}</p>
          <p className="max-w-56 text-xs text-fg-subtle">
            {entry.kind === "source"
              ? "Supplies as much as the factory needs, up to a limit you can set."
              : "Takes what the factory makes; give it a target to plan towards."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base font-semibold tracking-tight text-fg">{entry.title}</span>
          {entry.alternate && <AltBadge />}
        </div>
        <span className="text-xs text-fg-subtle">
          {entry.building} · <span className="font-mono">{formatNumber(entry.seconds)} s</span> per craft
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Per machine</span>
        <RateList rates={entry.inputs} rateUnit={rateUnit} />
        {entry.inputs.length > 0 && <ArrowRight className="size-3.5 text-fg-faint" aria-label="makes" />}
        <RateList rates={entry.outputs} rateUnit={rateUnit} />
      </div>
    </div>
  );
}

function RateList({
  rates,
  rateUnit,
}: {
  rates: Extract<PickerEntry, { kind: "recipe" }>["inputs"];
  rateUnit: RateUnit;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {rates.map((rate) => (
        <li key={rate.item.id} className="flex items-center gap-2">
          <ItemChip item={rate.item} size="sm" />
          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{rate.item.name}</span>
          <Rate perSecond={rate.perSecond} unit={rateUnit} className="text-xs text-fg" />
        </li>
      ))}
    </ul>
  );
}
