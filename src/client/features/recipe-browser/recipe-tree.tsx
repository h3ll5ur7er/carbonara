// The recipe browser's list: a tree of collapsible groups and their recipes, with section headings between them.
// Only the rows in view are drawn (packs list hundreds of recipes), each at its offset in a list of fixed row heights,
// plus the row with the keyboard focus, so the focus never drops when it scrolls away. Rows slide to their new place
// when a group opens or closes, and a group's recipes fade in; both follow the motion tokens.
//
// Keys (the tree pattern): ↑↓ move, Home and End jump, → opens a group or goes into it, ← closes it or goes up to
// it, Enter opens or closes a group and adds a recipe (Shift+Enter adds and stays), F stars a recipe. ↑ on the first
// row goes back to the search field.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import type { BrowserRow, BrowsedRecipe, Shelf } from "./browse";

/** Row heights in pixels, matching their Tailwind heights (h-7, h-9, h-11). */
export const ROW_HEIGHTS: Record<BrowserRow["kind"], number> = { section: 28, group: 36, recipe: 44 };
/** Rows drawn beyond the view, so a quick scroll doesn't show the list being built. */
const OVERSCAN = 6;
/** How long rows take to slide after a group opens or closes: --duration-base, which reduced motion makes 0. */
const SLIDE_MS = 220;
const NO_KEYS: ReadonlySet<string> = new Set();

export interface RecipeTreeProps {
  rows: BrowserRow[];
  label: string;
  /** The key of the row the keyboard is on, if the list has one. */
  active: string | undefined;
  onActiveChange(key: string): void;
  onToggle(shelf: Shelf): void;
  /** Enter on a recipe; `stay` with Shift, to keep the focus in the list. */
  onAdd(row: Extract<BrowserRow, { kind: "recipe" }>, stay: boolean): void;
  onFavourite(recipe: BrowsedRecipe): void;
  /** What screen readers call a recipe's row. */
  recipeLabel(recipe: BrowsedRecipe): string;
  /** ↑ on the first row. */
  onLeaveTop(): void;
  renderGroup(row: Extract<BrowserRow, { kind: "group" }>): ReactNode;
  renderRecipe(row: Extract<BrowserRow, { kind: "recipe" }>): ReactNode;
  renderSection(row: Extract<BrowserRow, { kind: "section" }>): ReactNode;
  /** Asks the active row to take the focus: changes when the person moves into the list from outside. */
  focusRequest: number;
  /** Bumped when a group opened or closed by hand: rows below slide instead of jumping. */
  slide: number;
}

export function RecipeTree({
  rows,
  label,
  active,
  onActiveChange,
  onToggle,
  onAdd,
  onFavourite,
  recipeLabel,
  onLeaveTop,
  renderGroup,
  renderRecipe,
  renderSection,
  focusRequest,
  slide,
}: RecipeTreeProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  const offsets = useMemo(() => {
    const tops: number[] = [];
    let top = 0;
    for (const row of rows) {
      tops.push(top);
      top += ROW_HEIGHTS[row.kind];
    }
    return { tops, total: top };
  }, [rows]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setView({ top: element.scrollTop, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const onScroll = (event: UIEvent<HTMLDivElement>) =>
    setView({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight });

  // Rows slide for a moment after a group was opened or closed by hand, and only then (not while typing); rows that
  // weren't there before fade in where they land. The slide starts in the very render that moves them, so it's
  // derived from the props here rather than in an effect.
  const [motion, setMotion] = useState({ slide, rows, sliding: false, fresh: NO_KEYS });
  if (slide !== motion.slide || rows !== motion.rows) {
    const started = slide !== motion.slide;
    const before = new Set(motion.rows.map((row) => row.key));
    setMotion({
      slide,
      rows,
      sliding: started || motion.sliding,
      fresh: started ? new Set(rows.map((row) => row.key).filter((key) => !before.has(key))) : NO_KEYS,
    });
  }
  const { sliding, fresh } = motion;
  useEffect(() => {
    if (!sliding) return;
    const timer = setTimeout(() => setMotion((state) => ({ ...state, sliding: false, fresh: NO_KEYS })), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [sliding, slide]);

  // The positions in the tree screen readers announce: each group among the groups, each recipe in its group.
  const positions = useMemo(() => {
    const result = new Map<string, { position: number; size: number }>();
    const groups = rows.filter((row) => row.kind === "group");
    groups.forEach((row, index) => result.set(row.key, { position: index + 1, size: groups.length }));
    for (const row of rows) {
      if (row.kind !== "recipe") continue;
      const index = row.shelf.recipes.indexOf(row.recipe);
      result.set(row.key, { position: index + 1, size: row.shelf.recipes.length });
    }
    return result;
  }, [rows]);

  const focusable = useMemo(() => rows.filter((row) => row.kind !== "section"), [rows]);
  // Recipes listed without their group (what a search found) are at the tree's top level.
  const grouped = useMemo(() => new Set(rows.flatMap((row) => (row.kind === "group" ? [row.key] : []))), [rows]);
  const current = focusable.find((row) => row.key === active) ?? focusable[0];

  // Which rows to draw: those in view and around it, and the active one wherever it is.
  const first = Math.max(0, lowerBound(offsets.tops, view.top) - 1 - OVERSCAN);
  const last = Math.min(rows.length - 1, lowerBound(offsets.tops, view.top + view.height) + OVERSCAN);
  const drawn = rows.slice(first, last + 1);
  if (current && !drawn.includes(current)) drawn.push(current);

  /** Brings a row into view, scrolling as little as it takes. */
  const reveal = useCallback(
    (key: string) => {
      const element = scroller.current;
      const index = rows.findIndex((row) => row.key === key);
      if (!element || index < 0) return;
      const top = offsets.tops[index] ?? 0;
      const bottom = top + ROW_HEIGHTS[rows[index]?.kind ?? "recipe"];
      // Scrolling up to a group's first row shows the section heading above it too.
      const heading = index > 0 && rows[index - 1]?.kind === "section" ? ROW_HEIGHTS.section : 0;
      if (top < element.scrollTop) element.scrollTop = top - heading;
      else if (bottom > element.scrollTop + element.clientHeight) element.scrollTop = bottom - element.clientHeight;
    },
    [rows, offsets],
  );

  // The keyboard moved to another row (or into the list): it takes the focus once it's drawn.
  const wantFocus = useRef(false);
  useEffect(() => {
    if (focusRequest === 0 || !current) return;
    reveal(current.key);
    // The active row is always drawn, so it can take the focus right away.
    scroller.current
      ?.querySelector<HTMLElement>(`[data-row="${CSS.escape(current.key)}"]`)
      ?.focus({ preventScroll: true });
    // A new request is all this reacts to; the row is the one active then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);
  useLayoutEffect(() => {
    if (!wantFocus.current || !current) return;
    const element = scroller.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(current.key)}"]`);
    if (element) {
      wantFocus.current = false;
      element.focus({ preventScroll: true });
    }
  });

  const moveTo = (row: BrowserRow | undefined) => {
    if (!row) return;
    wantFocus.current = true;
    onActiveChange(row.key);
    reveal(row.key);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!current || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = focusable.indexOf(current);
    const group = current.kind === "group" ? current : focusable.find((row) => row.key === current.shelf?.id);
    switch (event.key) {
      case "ArrowDown":
        moveTo(focusable[index + 1]);
        break;
      case "ArrowUp":
        if (index === 0) onLeaveTop();
        else moveTo(focusable[index - 1]);
        break;
      case "Home":
        moveTo(focusable[0]);
        break;
      case "End":
        moveTo(focusable.at(-1));
        break;
      case "ArrowRight":
        if (current.kind !== "group") return;
        if (current.expanded) moveTo(focusable[index + 1]);
        else onToggle(current.shelf);
        break;
      case "ArrowLeft":
        if (current.kind === "group" && current.expanded) onToggle(current.shelf);
        else if (current.kind === "recipe") moveTo(group);
        else return;
        break;
      case "Enter":
        if (current.kind === "group") onToggle(current.shelf);
        else if (current.kind === "recipe") onAdd(current, event.shiftKey);
        break;
      case "f":
      case "F":
        if (current.kind !== "recipe" || event.shiftKey) return;
        onFavourite(current.recipe);
        break;
      default:
        return;
    }
    // Handled here: the app's own shortcuts (F zooms to fit) don't run.
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
      <div role="tree" aria-label={label} onKeyDown={onKeyDown} style={{ height: offsets.total }} className="relative">
        {drawn.map((row) => {
          const index = rows.indexOf(row);
          const top = offsets.tops[index] ?? 0;
          const position = positions.get(row.key);
          const style = {
            top,
            height: ROW_HEIGHTS[row.kind],
            transition: sliding ? "top var(--duration-base) var(--ease-out)" : undefined,
          };
          if (row.kind === "section") {
            return (
              <div key={row.key} aria-hidden style={style} className="absolute inset-x-0">
                {renderSection(row)}
              </div>
            );
          }
          const isActive = row === current;
          return (
            <div
              key={row.key}
              role="treeitem"
              data-row={row.key}
              tabIndex={isActive ? 0 : -1}
              aria-level={row.kind === "recipe" && grouped.has(row.shelf.id) ? 2 : 1}
              aria-posinset={position?.position}
              aria-setsize={position?.size}
              {...(row.kind === "group" && { "aria-expanded": row.expanded })}
              aria-label={row.kind === "group" ? groupLabel(row.shelf) : recipeLabel(row.recipe)}
              {...(fresh.has(row.key) && sliding && { "data-fresh": "" })}
              onFocus={() => row.key !== active && onActiveChange(row.key)}
              style={style}
              className="group/row absolute inset-x-0 px-1.5 outline-none data-fresh:animate-fade-in"
            >
              {row.kind === "group" ? renderGroup(row) : renderRecipe(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The index of the first offset at or after `value`. */
function lowerBound(sorted: number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] ?? 0) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function groupLabel(shelf: Shelf): string {
  const count = shelf.recipes.length;
  const recipes = `${count} ${count === 1 ? "recipe" : "recipes"}`;
  return [shelf.name, shelf.section, recipes].filter(Boolean).join(", ");
}
