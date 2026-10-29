// The recipe browser, the library panel's first tab: every recipe of the open factory's pack, found by typing or
// browsed in groups (by machine, and by category or unlock where the pack says), with the person's favourites and
// latest recipes on top. A click adds a recipe mid-view, a drag places it where it's let go (it follows the pointer as
// a ghost over the canvas), Enter adds it from the keyboard; the new node is selected.
import {
  ChevronRight,
  Flag,
  FlaskConical,
  History,
  Plus,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Star,
  StarOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Id, PackData } from "../../../contracts/pack";
import { own } from "../../../utilities/records";
import { canvasEditActions } from "../../canvas/edit-actions";
import { focusNodeWhenShown } from "../../canvas/focus";
import { BuildingTile, ItemChip } from "../../canvas/parts";
import type { PortRef } from "../../canvas/edit-actions";
import { overCanvas, startPlacing, stopPlacing } from "../../canvas/placing";
import { IconButton } from "../../ui/button";
import { cx } from "../../ui/cx";
import { fieldSurface } from "../../ui/input";
import { Kbd } from "../../ui/kbd";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuLabel,
  MenuTrigger,
} from "../../ui/menu";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  browsable,
  browserRows,
  groupOptions,
  matching,
  searchRecipes,
  shelves,
  type BrowsedRecipe,
  type BrowserRow,
  type GroupBy,
  type Shelf,
} from "./browse";
import { setFilters, setGroupBy, setQuery, toggleGroup, useBrowser } from "./browser-store";
import { rememberAdded, toggleFavourite, useMemoryOf } from "./memory";
import { RecipeTree } from "./recipe-tree";
import type { Suggestion } from "./suggest";

/** Pointer travel, in pixels, after which a press on a recipe is a drag. */
const DRAG = 4;
/** Up to this many recipes, every group starts open; more, and they start closed. */
const OPEN_UP_TO = 60;

const GROUPINGS: Record<GroupBy, string> = { building: "Machine", category: "Category", unlock: "Unlock" };

/** Groups of their own above the pack's: what the person keeps, and what they used last. */
const SPECIAL = { favourites: "special:favourites", recent: "special:recent", suggested: "special:suggested" };

export interface RecipeBrowserProps {
  packId: string;
  /** The pack's data; the browser says it's loading until it's there. */
  pack: PackData | undefined;
  /** Keys of "Find a recipe", shown in the search field. */
  findKeys?: string[] | undefined;
  /** Recipes the factory could use next, with why (CARB-136): a group of their own when there are any. */
  suggestions?: Suggestion[] | undefined;
}

export function RecipeBrowser({ packId, pack, findKeys, suggestions = [] }: RecipeBrowserProps) {
  const query = useBrowser((state) => state.query);
  const chosen = useBrowser((state) => own(state.groupBy, packId));
  const toggled = useBrowser((state) => own(state.toggled, `${packId}/${chosen ?? "building"}`));
  const alternates = useBrowser((state) => state.alternates);
  const recycling = useBrowser((state) => state.recycling);
  const searchFocus = useBrowser((state) => state.searchFocus);
  const memory = useMemoryOf(packId);

  const recipes = useMemo(() => (pack ? browsable(pack) : []), [pack]);
  const byId = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const options = useMemo(() => (pack ? groupOptions(pack) : (["building"] as GroupBy[])), [pack]);
  const by = chosen && options.includes(chosen) ? chosen : "building";
  const hasRecycling = recipes.some((recipe) => recipe.recycling);
  const hasAlternates = recipes.some((recipe) => recipe.alternate);
  const searching = query.trim() !== "";

  const shown = useMemo(
    () => matching(recipes, "", { recycling }).filter((recipe) => alternates || !recipe.alternate),
    [recipes, recycling, alternates],
  );
  const groups = useMemo(() => (pack ? shelves(shown, pack, by) : []), [pack, shown, by]);
  const found = useMemo(() => searchRecipes(shown, query, { recycling }), [shown, query, recycling]);
  const special = useMemo((): Shelf[] => {
    const pick = (ids: Id[]) => ids.flatMap((id) => byId.get(id) ?? []);
    const suggested = pick(suggestions.map((suggestion) => suggestion.recipe));
    return [
      { id: SPECIAL.favourites, name: "Favourites", recipes: pick(memory.favourites) },
      { id: SPECIAL.recent, name: "Recent", recipes: pick(memory.recent) },
      { id: SPECIAL.suggested, name: "Suggested", recipes: suggested },
    ].filter((shelf) => shelf.recipes.length > 0);
  }, [byId, memory, suggestions]);

  const small = shown.length <= OPEN_UP_TO;
  const rows = useMemo(() => {
    // Searching lists what's found, best first, under how many there are.
    if (searching) return resultRows(found);
    const open = (id: string) => {
      const flipped = (toggled ?? []).includes(id);
      const startsOpen = id.startsWith("special:") || small;
      return startsOpen !== flipped;
    };
    // The pack's groups sit under a heading of their own once the special ones are above them.
    const all = special.length > 0 ? withHeading(groups) : groups;
    return browserRows([...special, ...all], open);
  }, [special, groups, searching, found, toggled, small]);

  const [active, setActive] = useState<string>();
  const [focusRequest, setFocusRequest] = useState(0);
  const [slide, setSlide] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchFocus > 0) search.current?.focus();
  }, [searchFocus]);

  const toggle = (shelf: Shelf) => {
    setSlide((count) => count + 1);
    toggleGroup(`${packId}/${by}`, shelf.id);
  };
  /** The port a row's recipe connects to when added: a suggestion's. */
  const connectionOf = (row: Extract<BrowserRow, { kind: "recipe" }>) =>
    row.shelf.id === SPECIAL.suggested
      ? suggestions.find((suggestion) => suggestion.recipe === row.recipe.id)?.connectTo
      : undefined;
  const add = (recipe: BrowsedRecipe, focusNode: boolean, connectTo?: PortRef) => {
    const canvas = canvasEditActions();
    if (!canvas) return;
    const id = canvas.addNode({ kind: "recipe", recipe: recipe.id }, { label: `Add ${recipe.title}`, connectTo });
    rememberAdded(packId, recipe.id);
    setAnnouncement(`Added ${recipe.title}`);
    if (focusNode) focusNodeWhenShown(id);
  };
  const favourite = (recipe: BrowsedRecipe) => {
    const starred = !memory.favourites.includes(recipe.id);
    toggleFavourite(packId, recipe.id, starred);
    setAnnouncement(starred ? `${recipe.title} added to favourites` : `${recipe.title} removed from favourites`);
  };

  /** A press that moves is a drag: the recipe follows the pointer over the canvas. One that doesn't, a click: add. */
  const onPointerDown = (recipe: BrowsedRecipe, connectTo?: PortRef) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const onMove = (move: globalThis.PointerEvent) => {
      if (dragging || Math.hypot(move.clientX - start.x, move.clientY - start.y) <= DRAG) return;
      dragging = true;
      startPlacing({
        node: { kind: "recipe", recipe: recipe.id },
        label: recipe.title,
        connectTo,
        onPlaced: () => {
          rememberAdded(packId, recipe.id);
          setAnnouncement(`Added ${recipe.title}`);
        },
      });
    };
    const onUp = (up: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // Let go over the canvas, the canvas places it where its ghost is; anywhere else, never mind.
      if (dragging) {
        if (!overCanvas(up)) stopPlacing();
      } else add(recipe, false, connectTo);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!pack) {
    return <p className="px-4 py-8 text-center text-sm text-fg-subtle">Loading recipes…</p>;
  }

  const filtered = !alternates || recycling;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
        <label className={cx(fieldSurface, "flex h-8 items-center gap-2 px-2.5")}>
          <Search className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          <input
            ref={search}
            type="search"
            aria-label="Search recipes"
            placeholder="Search recipes or items"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              } else if ((event.key === "ArrowDown" || event.key === "Enter") && rows.length > 0) {
                event.preventDefault();
                // Into the list, on the first recipe found (or the first row).
                const first = rows.find((row) => row.kind === "recipe") ?? rows.find((row) => row.kind === "group");
                if (first) setActive(first.key);
                setFocusRequest((count) => count + 1);
              }
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <IconButton size="sm" tooltip={false} label="Clear search" icon={<X />} onClick={() => setQuery("")} />
          ) : (
            findKeys && <Kbd keys={findKeys} />
          )}
        </label>
        <div className="flex items-center gap-2">
          {options.length > 1 ? (
            <Tabs value={by} onValueChange={(value) => setGroupBy(packId, value as GroupBy)} className="min-w-0 flex-1">
              <TabsList aria-label="Group recipes by" className="flex w-full">
                {options.map((option) => (
                  <TabsTrigger key={option} value={option} panel={false}>
                    {GROUPINGS[option]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <span className="flex-1 px-1 text-2xs font-medium tracking-wide text-fg-faint uppercase">By machine</span>
          )}
          {(hasAlternates || hasRecycling) && (
            <Menu>
              <MenuTrigger asChild>
                <IconButton
                  size="sm"
                  label="Filter recipes"
                  icon={
                    <span className="relative">
                      <SlidersHorizontal />
                      {filtered && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-accent" />}
                    </span>
                  }
                />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuLabel>Show</MenuLabel>
                {hasAlternates && (
                  <MenuCheckboxItem
                    checked={alternates}
                    onCheckedChange={(checked) => setFilters({ alternates: checked })}
                  >
                    Alternate recipes
                  </MenuCheckboxItem>
                )}
                {hasRecycling && (
                  <MenuCheckboxItem
                    checked={recycling}
                    onCheckedChange={(checked) => setFilters({ recycling: checked })}
                  >
                    Recycling
                  </MenuCheckboxItem>
                )}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <NothingFound
          query={query}
          hiddenRecycling={
            !recycling && matching(recipes, query, { recycling: true }).some((recipe) => recipe.recycling)
          }
        />
      ) : (
        <RecipeTree
          rows={rows}
          label="Recipes"
          active={active}
          onActiveChange={setActive}
          onToggle={toggle}
          onAdd={(row, stay) => add(row.recipe, !stay, connectionOf(row))}
          onFavourite={favourite}
          onLeaveTop={() => search.current?.focus()}
          focusRequest={focusRequest}
          slide={slide}
          recipeLabel={(recipe) =>
            memory.favourites.includes(recipe.id) ? `${recipeLabelOf(recipe)}, favourite` : recipeLabelOf(recipe)
          }
          renderSection={(row) => <SectionHeading label={row.label} />}
          renderGroup={(row) => <GroupRow row={row} onToggle={() => toggle(row.shelf)} />}
          renderRecipe={(row) => (
            <RecipeRow
              recipe={row.recipe}
              showBuilding={by !== "building" || searching || row.shelf.id.startsWith("special:")}
              reason={
                row.shelf.id === SPECIAL.suggested
                  ? suggestions.find((suggestion) => suggestion.recipe === row.recipe.id)?.reason
                  : undefined
              }
              favourite={memory.favourites.includes(row.recipe.id)}
              onPointerDown={onPointerDown(row.recipe, connectionOf(row))}
              onAdd={() => add(row.recipe, false, connectionOf(row))}
              onFavourite={() => favourite(row.recipe)}
            />
          )}
        />
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p className="border-t border-line-subtle px-4 py-2 text-2xs text-fg-faint">
        Click to add, or drag onto the canvas. Star the recipes you use most.
      </p>
    </div>
  );
}

const RESULTS: Shelf = { id: "special:results", name: "Results", recipes: [] };

/** What a search found, as rows: a heading with how many, then each recipe (no groups). */
function resultRows(found: BrowsedRecipe[]): BrowserRow[] {
  if (found.length === 0) return [];
  const shelf = { ...RESULTS, recipes: found };
  const count = `${found.length} ${found.length === 1 ? "recipe" : "recipes"}`;
  return [
    { kind: "section", key: "section:results", label: count },
    ...found.map((recipe): BrowserRow => ({ kind: "recipe", key: `results/${recipe.id}`, recipe, shelf })),
  ];
}

/** The groups of the pack under one heading, unless the pack files them under sections of its own. */
function withHeading(groups: Shelf[]): Shelf[] {
  return groups.map((shelf) => (shelf.section === undefined ? { ...shelf, section: "All recipes" } : shelf));
}

export function recipeLabelOf(recipe: BrowsedRecipe): string {
  const takes = recipe.inputs.length > 0 ? `, from ${recipe.inputs.join(", ")}` : "";
  return `${recipe.title}${recipe.alternate ? ", alternate" : ""}, ${recipe.building.name}${takes}`;
}

function SectionHeading({ label }: { label: string | undefined }) {
  return (
    <div className="flex h-7 items-end gap-2 px-3 pb-1.5">
      {label && <span className="truncate text-2xs font-semibold tracking-wide text-fg-faint uppercase">{label}</span>}
      <span className="mb-1.5 h-px min-w-4 flex-1 bg-line-subtle" />
    </div>
  );
}

function GroupRow({ row, onToggle }: { row: Extract<BrowserRow, { kind: "group" }>; onToggle(): void }) {
  const { shelf, expanded } = row;
  return (
    <div
      onClick={onToggle}
      className={cx(
        "flex h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 select-none",
        "hover:bg-surface-3 group-focus-visible/row:outline-2 group-focus-visible/row:outline-accent",
      )}
    >
      <ChevronRight
        aria-hidden
        className={cx(
          "size-3.5 shrink-0 text-fg-faint transition-transform duration-(--duration-fast)",
          expanded && "rotate-90",
        )}
      />
      <GroupIcon shelf={shelf} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{shelf.name}</span>
      <span className="font-mono text-2xs text-fg-faint tabular-nums">{shelf.recipes.length}</span>
    </div>
  );
}

function GroupIcon({ shelf }: { shelf: Shelf }) {
  const tile = "grid size-6 shrink-0 place-items-center rounded-sm ring-1 ring-inset [&_svg]:size-3.5";
  if (shelf.building !== undefined) {
    return (
      <BuildingTile
        building={{ id: shelf.building, name: shelf.name }}
        className={cx(tile, "bg-accent-soft text-2xs font-semibold text-accent-fg ring-accent-soft")}
      />
    );
  }
  const icons: Record<string, ReactNode> = {
    [SPECIAL.favourites]: <Star className="fill-current" />,
    [SPECIAL.recent]: <History />,
    [SPECIAL.suggested]: <Sparkles />,
  };
  const special = icons[shelf.id];
  const icon =
    special ?? (shelf.id === "unlock:" ? <Flag /> : shelf.id.startsWith("unlock:") ? <FlaskConical /> : <Shapes />);
  return (
    <span
      aria-hidden
      className={cx(
        tile,
        special ? "bg-accent-soft text-accent-fg ring-accent-soft" : "bg-surface-3 text-fg-subtle ring-line-subtle",
      )}
    >
      {icon}
    </span>
  );
}

function RecipeRow({
  recipe,
  showBuilding,
  reason,
  favourite,
  onPointerDown,
  onAdd,
  onFavourite,
}: {
  recipe: BrowsedRecipe;
  showBuilding: boolean;
  /** Why it's suggested, in place of what it takes. */
  reason: string | undefined;
  favourite: boolean;
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onAdd(): void;
  onFavourite(): void;
}) {
  const takes = recipe.inputs.length > 0 ? recipe.inputs.join(", ") : "Takes nothing";
  const detail = reason ?? (showBuilding ? `${recipe.building.name} · ${takes}` : takes);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onPointerDown={onPointerDown}
          title="Click to add, or drag onto the canvas"
          className={cx(
            "flex h-11 cursor-grab touch-none items-center gap-2.5 rounded-md pr-1 pl-6 select-none active:cursor-grabbing",
            "hover:bg-surface-3 group-focus-visible/row:outline-2 group-focus-visible/row:outline-accent",
          )}
        >
          {recipe.product ? (
            <ItemChip item={recipe.product} size="md" />
          ) : (
            <span aria-hidden className="size-7 shrink-0 rounded-sm bg-surface-3" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm text-fg">{recipe.title}</span>
              {recipe.alternate && (
                <span className="shrink-0 rounded-xs bg-surface-4 px-1 text-2xs font-medium text-fg-muted">Alt</span>
              )}
            </span>
            <span className="truncate text-2xs text-fg-subtle">{detail}</span>
          </span>
          <button
            type="button"
            tabIndex={-1}
            aria-label={favourite ? `Remove ${recipe.title} from favourites` : `Add ${recipe.title} to favourites`}
            aria-pressed={favourite}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onFavourite}
            className={cx(
              "grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm transition-opacity [&_svg]:size-3.5",
              "hover:bg-surface-4",
              favourite
                ? "text-accent-fg"
                : "text-fg-faint opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 hover:text-fg",
            )}
          >
            <Star className={favourite ? "fill-current" : undefined} />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<Plus />} shortcut={["↵"]} onSelect={onAdd}>
          Add to factory
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={favourite ? <StarOff /> : <Star />} shortcut={["F"]} onSelect={onFavourite}>
          {favourite ? "Remove from favourites" : "Add to favourites"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NothingFound({ query, hiddenRecycling }: { query: string; hiddenRecycling: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-12 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-fg-subtle inset-ring inset-ring-line-subtle">
        <Search className="size-4.5" aria-hidden />
      </span>
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm font-medium text-fg-muted">
          {query.trim() ? `Nothing matches “${query.trim()}”` : "No recipes"}
        </p>
        <p className="text-xs text-fg-subtle">
          {hiddenRecycling ? (
            <>
              Recycling recipes match.{" "}
              <button
                type="button"
                className="font-medium text-accent-fg underline-offset-2 hover:underline"
                onClick={() => setFilters({ recycling: true })}
              >
                Show recycling
              </button>
            </>
          ) : (
            "Try an item, a machine or part of a recipe's name."
          )}
        </p>
      </div>
    </div>
  );
}
