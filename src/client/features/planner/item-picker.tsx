// Picks the item a goal is for: a field that shows the chosen item and, while typed in, lists the pack's
// items that match (arrows to move, Enter to pick, Escape to keep the old one).
import { Command } from "cmdk";
import { ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id, PackData } from "../../../contracts/pack";
import { ItemChip } from "../../canvas/parts";
import { cx } from "../../ui/cx";
import { fieldSurface } from "../../ui/input";
import { popoverSurface } from "../../ui/popover";
import { findItems } from "./plan";

export interface ItemPickerProps {
  pack: PackData;
  value: Id | null;
  onValueChange(item: Id): void;
  "aria-label": string;
  autoFocus?: boolean;
}

export function ItemPicker({ pack, value, onValueChange, autoFocus, ...aria }: ItemPickerProps) {
  const [query, setQuery] = useState<string | null>(null);
  const open = query !== null;
  const items = useMemo(() => (open ? findItems(pack, query) : []), [pack, query, open]);
  const chosen = pack.items.find((item) => item.id === value);
  const made = useMemo(() => new Set(pack.recipes.flatMap((recipe) => Object.keys(recipe.out))), [pack]);

  function pick(item: Id) {
    onValueChange(item);
    setQuery(null);
  }

  return (
    // The list opens under the whole goal row: the row is the positioned ancestor.
    <Command shouldFilter={false} loop className="min-w-0 flex-1" label={aria["aria-label"]}>
      <div className={cx(fieldSurface, "flex h-8 items-center gap-2 pr-2 pl-1.5")}>
        {chosen && !open ? (
          <ItemChip item={chosen} size="sm" />
        ) : (
          <span className="size-5 shrink-0 rounded-sm border border-dashed border-line-strong" aria-hidden />
        )}
        <Command.Input
          {...aria}
          autoFocus={autoFocus}
          value={open ? query : (chosen?.name ?? "")}
          placeholder="Pick an item"
          onValueChange={setQuery}
          onFocus={(event) => {
            event.target.select();
            setQuery("");
          }}
          onBlur={() => setQuery(null)}
          onKeyDown={(event) => {
            // Closes the list and keeps the old item, with the focus kept here: a second Escape closes the card.
            if (event.key === "Escape" && open) {
              event.stopPropagation();
              setQuery(null);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
        />
        <ChevronsUpDown className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
      </div>
      {open && (
        <Command.List
          // Solid: frosted glass can't blur through the planner's own glass.
          className={cx(
            popoverSurface,
            "absolute top-full right-0 left-0 mt-1 max-h-64 overflow-y-auto bg-surface-2 p-1",
          )}
        >
          <Command.Empty className="px-3 py-6 text-center text-xs text-fg-subtle">
            Nothing matches “{query}”.
          </Command.Empty>
          {items.map((item) => (
            <Command.Item
              key={item.id}
              value={item.id}
              onMouseDown={(event) => event.preventDefault()}
              onSelect={() => pick(item.id)}
              className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2 select-none data-[selected=true]:bg-accent-soft"
            >
              <ItemChip item={item} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.name}</span>
              {!made.has(item.id) && <span className="shrink-0 text-2xs text-fg-subtle">Raw</span>}
            </Command.Item>
          ))}
        </Command.List>
      )}
    </Command>
  );
}
