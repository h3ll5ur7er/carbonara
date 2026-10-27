// Editing every selected node at once, from the selection toolbar: swap the recipe of the selected machines for
// one that makes the same product, or set the belt (or pipe) of their flows. Each is one undoable edit.
// The menus read the selection when they open.
import { ChevronDown } from "lucide-react";
import type { RefObject } from "react";
import type { CommandInput } from "../../contracts/commands";
import { TagColour, type Document, type LocalId } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import { alternativesFor, recipeChangeCommands } from "../features/find/find";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "../ui/menu";
import { canvasEditActions } from "./edit-actions";
import type { Selection } from "./use-edit-actions";

export interface MultiEditProps {
  document: Document;
  pack: PackData;
  graph: string;
  selection: RefObject<Selection>;
  apply(commands: CommandInput[], label: string): Promise<void>;
}

const trigger =
  "flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface-3 hover:text-fg " +
  "focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none data-[state=open]:bg-surface-3";

export function MultiEdit(props: MultiEditProps) {
  return (
    <>
      <Menu>
        <MenuTrigger className={trigger}>
          Recipe <ChevronDown className="size-3.5" aria-hidden />
        </MenuTrigger>
        <MenuContent>
          <RecipeItems {...props} />
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger className={trigger}>
          Belt <ChevronDown className="size-3.5" aria-hidden />
        </MenuTrigger>
        <MenuContent>
          <BeltItems {...props} />
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger className={trigger}>
          Tag <ChevronDown className="size-3.5" aria-hidden />
        </MenuTrigger>
        <MenuContent>
          {[...TagColour.options, null].map((tag) => (
            <MenuItem
              key={tag ?? "none"}
              icon={tag ? <span data-tag={tag} className="node-tag-swatch item-tint" /> : undefined}
              onSelect={() => canvasEditActions()?.tag(tag)}
            >
              {tag ? tag.charAt(0).toUpperCase() + tag.slice(1) : "No tag"}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </>
  );
}

function graphOf(document: Document, graph: string) {
  return graph === "root" ? document.graph : document.blueprints[graph]?.graph;
}

/** The recipes every selected machine could run instead: those making the same main product as all of them. */
function RecipeItems({ document, pack, graph, selection, apply }: MultiEditProps) {
  const nodes = graphOf(document, graph)?.nodes ?? {};
  const machines = selection.current.nodes.filter((id) => nodes[id]?.kind === "recipe");
  const recipes = new Set(machines.map((id) => (nodes[id]?.kind === "recipe" ? nodes[id].recipe : "")));
  const [first] = recipes;
  const options = first
    ? [...alternativesFor(pack, first), ...pack.recipes.filter((recipe) => recipe.id === first)]
    : [];
  const fitting = options.filter((option) =>
    [...recipes].every((id) => id === option.id || alternativesFor(pack, id).includes(option)),
  );
  if (machines.length === 0 || fitting.length === 0) {
    return <MenuLabel>{machines.length === 0 ? "No machines selected" : "No other recipes make this"}</MenuLabel>;
  }
  return (
    <>
      <MenuLabel>
        Run {machines.length} machine{machines.length === 1 ? "" : "s"} on
      </MenuLabel>
      {fitting.map((recipe) => (
        <MenuItem
          key={recipe.id}
          onSelect={() =>
            void apply(
              recipeChangeCommands(document, pack, { [graph]: machines }, recipe.id),
              `Change ${machines.length} machines to ${recipe.name ?? recipe.id}`,
            )
          }
        >
          {recipe.name ?? pack.items.find((item) => item.id === Object.keys(recipe.out)[0])?.name ?? recipe.id}
        </MenuItem>
      ))}
    </>
  );
}

/** Belts and pipes for the selected flows and the flows of the selected nodes, each for the items it carries. */
function BeltItems({ document, pack, graph, selection, apply }: MultiEditProps) {
  const shown = graphOf(document, graph);
  const chosen = new Set(selection.current.nodes);
  const flows = Object.entries(shown?.edges ?? {}).filter(
    ([id, edge]) => selection.current.edges.includes(id) || chosen.has(edge.from) || chosen.has(edge.to),
  );
  const formOf = (item: string) => pack.items.find((candidate) => candidate.id === item)?.form ?? "solid";
  const set = (logistics: string | null, ids: LocalId[], label: string) => {
    if (ids.length > 0) void apply([{ type: "setLogistics", graph, ids, logistics }], label);
  };
  if (flows.length === 0) return <MenuLabel>No flows selected</MenuLabel>;
  return (
    <>
      <MenuLabel>
        {flows.length} flow{flows.length === 1 ? "" : "s"}
      </MenuLabel>
      {pack.logistics.map((logistics) => {
        const ids = flows.filter(([, edge]) => formOf(edge.item) === logistics.carries).map(([id]) => id);
        return (
          <MenuItem
            key={logistics.id}
            disabled={ids.length === 0}
            onSelect={() => set(logistics.id, ids, `Put ${ids.length} flows on ${logistics.name ?? logistics.id}`)}
          >
            {logistics.name ?? logistics.id}
          </MenuItem>
        );
      })}
      <MenuItem
        onSelect={() =>
          set(
            null,
            flows.map(([id]) => id),
            "Remove belts",
          )
        }
      >
        No belt (unlimited)
      </MenuItem>
    </>
  );
}
