// The find panel (Ctrl+F): a bar over the canvas that lists the nodes matching what you type, across the whole
// factory, subgraphs included. ↑↓ move, Enter jumps to the node (the panel stays, to step through), Escape
// closes. For a recipe it offers to replace that recipe everywhere with one that makes the same product.
import { Command } from "cmdk";
import { CornerDownLeft, Replace, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Document } from "../../../contracts/document";
import type { Id, PackData } from "../../../contracts/pack";
import { cx } from "../../ui/cx";
import { Kbd } from "../../ui/kbd";
import { alternativesFor, findInFactory, type FindResult } from "./find";
import { setFindOpen } from "./find-store";

export interface FindPanelProps {
  document: Document;
  pack: PackData;
  /** The graph on the canvas: only its nodes can be jumped to. */
  graph: string;
  /** Where the visible canvas is, clear of the side panels. */
  left: number;
  right: number;
  onJump(result: FindResult): void;
  /** Swap every node running `from` for `to`. */
  onReplace(from: Id, to: Id): void;
}

const item = cx(
  "group/item flex h-9 cursor-default items-center gap-3 rounded-md px-2.5 text-sm text-fg-muted select-none",
  "data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg data-[disabled=true]:opacity-55",
);

export function FindPanel({ document, pack, graph, left, right, onJump, onReplace }: FindPanelProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const results = useMemo(() => findInFactory(document, pack, query), [document, pack, query]);
  const keyOf = (result: FindResult) => `${result.graph}/${result.nodeId}`;
  const current = results.find((result) => keyOf(result) === active) ?? results[0];
  const recipe = current?.recipe;
  const alternatives = recipe ? alternativesFor(pack, recipe) : [];
  const recipeName = (id: Id) => {
    const found = pack.recipes.find((candidate) => candidate.id === id);
    const output = Object.keys(found?.out ?? {})[0];
    return found?.name ?? pack.items.find((entry) => entry.id === output)?.name ?? id;
  };

  return (
    <div style={{ left, right }} className="pointer-events-none absolute top-3 flex justify-center">
      <Command
        label="Find in factory"
        shouldFilter={false}
        loop
        value={active}
        onValueChange={setActive}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setFindOpen(false);
          }
        }}
        className="pointer-events-auto flex w-120 max-w-full animate-pop-in flex-col overflow-hidden rounded-xl bg-glass shadow-overlay backdrop-blur-glass backdrop-saturate-150"
      >
        <div className="flex h-11 items-center gap-3 border-b border-line-subtle px-3.5">
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Find items, recipes and nodes…"
            aria-label="Find in factory"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
          />
          <Kbd keys={["Esc"]} />
        </div>
        {query.trim() && (
          <Command.List className="max-h-72 scroll-py-2 overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-sm text-fg-subtle">
              Nothing matches “{query}”.
            </Command.Empty>
            {results.map((result) => {
              // Subgraphs can't be opened on the canvas yet, so their nodes are listed but not jumped to.
              const reachable = result.graph === graph;
              return (
                <Command.Item
                  key={keyOf(result)}
                  value={keyOf(result)}
                  disabled={!reachable}
                  onSelect={() => onJump(result)}
                  className={item}
                >
                  <span className="min-w-0 truncate text-fg">{result.title}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
                    {[result.detail, reachable ? "" : `in ${result.where}`].filter(Boolean).join(" · ")}
                  </span>
                  <CornerDownLeft
                    className="size-3.5 shrink-0 text-accent-fg opacity-0 group-data-[selected=true]/item:opacity-100"
                    aria-hidden
                  />
                </Command.Item>
              );
            })}
          </Command.List>
        )}
        {recipe && alternatives.length > 0 && (
          <div
            role="group"
            aria-label="Replace everywhere"
            className="flex flex-wrap items-center gap-1.5 border-t border-line-subtle bg-surface-1/40 px-3 py-2 text-xs text-fg-subtle"
          >
            <Replace className="size-3.5" aria-hidden />
            <span>Replace {recipeName(recipe)} everywhere with</span>
            {alternatives.map((alternative) => (
              <button
                key={alternative.id}
                type="button"
                onClick={() => onReplace(recipe, alternative.id)}
                className="rounded-sm bg-surface-3 px-2 py-0.5 text-fg-muted hover:bg-accent-soft hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                {recipeName(alternative.id)}
              </button>
            ))}
          </div>
        )}
      </Command>
    </div>
  );
}
