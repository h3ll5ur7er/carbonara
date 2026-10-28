// The inspector wired to the editing manager: each committed edit is sent through the connector, and an edit
// the manager refuses (or that fails on the way) shows an error toast. With no node selected but a document
// open, it shows the document's Save profile instead.
import type { CommandInput } from "../../../contracts/commands";
import type { Id } from "../../../contracts/pack";
import { useConnector } from "../../core/connector";
import { toggleFavourite, useMemoryOf } from "../../features/recipe-browser/memory";
import { SaveProfile, type SaveProfileProps } from "../../features/save-profile/save-profile";
import { errorMessage, toast } from "../toasts";
import { applyFieldEdit, type FieldEdit, type FieldEditTarget } from "./edit";
import { Inspector, type InspectedNode, type InstanceActions } from "./inspector";

export interface NodeSelection {
  target: FieldEditTarget;
  node: InspectedNode;
  /** The commands that set the node's production value (see `productionEdit`). */
  productionEdit?: (value: number | null) => { commands: CommandInput[]; label: string } | null;
  /** A subgraph instance: going into it, and selecting its blueprint's other instances on screen. */
  subgraph?: Pick<InstanceActions, "open" | "selectSiblings"> | undefined;
  /** A recipe node: its recipe and pack, so the inspector can star the recipe (the recipe browser's favourites). */
  recipe?: { packId: string; recipe: Id } | undefined;
}

export interface InspectorPanelProps {
  /** The selected node and where it lives; the document's save profile when none is; null without a document. */
  selection: NodeSelection | { profile: SaveProfileProps } | null;
}

export function InspectorPanel({ selection }: InspectorPanelProps) {
  if (selection && "profile" in selection) return <SaveProfile {...selection.profile} />;
  return <NodeInspector selection={selection} />;
}

function NodeInspector({ selection }: { selection: NodeSelection | null }) {
  const connector = useConnector();
  const recipe = selection?.recipe;
  const favourites = useMemoryOf(recipe?.packId).favourites;

  async function apply(commands: CommandInput[], label: string) {
    if (!selection) return;
    try {
      const result = await connector.editing.apply({ documentId: selection.target.documentId, commands, label });
      if (!result.ok) reportFailure(result.error.map((issue) => issue.message).join(" "));
    } catch (error) {
      reportFailure(errorMessage(error));
    }
  }

  async function onFieldEdit(edit: FieldEdit) {
    if (!selection) return;
    try {
      const result = await applyFieldEdit(connector.editing, selection.target, edit);
      if (!result.ok) reportFailure(result.error.map((issue) => issue.message).join(" "));
    } catch (error) {
      reportFailure(errorMessage(error));
    }
  }

  async function onProductionEdit(value: number | null) {
    const edit = selection?.productionEdit?.(value);
    if (edit) await apply(edit.commands, edit.label);
  }

  const instance = selection?.node.instance;
  const subgraph = selection?.subgraph;
  const instanceActions: InstanceActions | undefined =
    selection && instance && subgraph
      ? {
          ...subgraph,
          rename: (name) =>
            apply([{ type: "renameBlueprint", blueprint: instance.blueprint, name }], `Rename blueprint to ${name}`),
          expand: () =>
            void apply(
              [{ type: "expand", graph: selection.target.graph ?? "root", id: selection.target.nodeId }],
              "Expand subgraph",
            ),
        }
      : undefined;

  return (
    <Inspector
      node={selection?.node ?? null}
      onFieldEdit={onFieldEdit}
      onProductionEdit={onProductionEdit}
      instanceActions={instanceActions}
      favourite={
        recipe && {
          starred: favourites.includes(recipe.recipe),
          onToggle: () => toggleFavourite(recipe.packId, recipe.recipe),
        }
      }
    />
  );
}

function reportFailure(description: string) {
  toast({ tone: "error", title: "Couldn't apply the edit", ...(description ? { description } : {}) });
}
