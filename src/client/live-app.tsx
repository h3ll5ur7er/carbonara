// The app as people use it: the shell around the open documents, kept in sync with the backend.
// (Scenes render `AppShell` with fixed data instead.)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "./canvas/canvas";
import { formatShortcut, platformOf } from "./core/commands-shortcuts";
import { paletteCommandId } from "./features/command-palette/command-palette";
import { appRegistry } from "./shell/app-commands";
import { AppShell, EmptyState } from "./shell/app-shell";
import { inspectNode, inspectSelection, productionEdit } from "./shell/inspector/inspect";
import type { InspectorPanelProps } from "./shell/inspector/inspector-panel";
import { usePluginDescription } from "./shell/inspector/plugin-description";
import { useConnector } from "./core/connector";
import { useActiveDocument, useModels, useWorkspace, type ActiveDocument } from "./core/models";
import { createDocumentActions, setDocumentActions } from "./features/documents/actions";
import { DocumentTabs } from "./features/documents/document-tabs";
import { sharedDocumentIn } from "./features/documents/links";
import { NewDocumentDialog } from "./features/documents/new-document-dialog";
import { useFactoryOverlays } from "./features/planner/factory-overlays";
import { followProposals } from "./features/planner/planner-store";
import { CheatSheet } from "./features/shortcuts/cheat-sheet";
import { Welcome } from "./features/documents/welcome";
import { McpHost } from "./features/mcp/host";
import { TourCard } from "./features/onboarding/tour-card";
import { useOnboarding } from "./features/onboarding/use-onboarding";
import { errorMessage, toast } from "./shell/toasts";
import { scopedTo } from "./features/subgraphs/path";
import { useSubgraphView, type SubgraphView } from "./features/subgraphs/use-subgraph-view";
import { useBlueprintPlacement, type BlueprintPlacement } from "./features/subgraphs/use-blueprint-placement";
import { BlueprintLibrary } from "./features/subgraphs/library-panel";
import { libraryEntries } from "./features/subgraphs/library";
import "./features/subgraphs/subgraphs.css";

export function LiveApp() {
  const connector = useConnector();
  const { workspace } = useModels();
  const loaded = useWorkspace((state) => state.loaded);
  const active = useActiveDocument();
  const { info } = active;

  useEffect(() => {
    setDocumentActions(createDocumentActions(connector, workspace));
    return () => setDocumentActions(null);
  }, [connector, workspace]);
  // Proposals open in the planner on their document's tab, whoever made them (the planner or an MCP client).
  useEffect(() => followProposals(connector, (documentId) => workspace.activate(documentId)), [connector, workspace]);

  useOpenSharedDocument();
  useReportRestoreProblems();
  const subgraph = useSubgraphView({ ...active, leaveShortcut: keysOf("subgraph.leave") });
  const { graph } = subgraph;
  useOnboarding(active);
  const [selection, setSelection] = useState<Selection | null>(null);
  const onSelectionChange = useCallback(
    (nodeIds: string[]) => setSelection(info ? { documentId: info.id, graph, nodeIds } : null),
    [info, graph],
  );
  const inspected = useInspected(active, subgraph, selection);
  const placement = useBlueprintPlacement(active.document, graph);
  const entries = useMemo(
    () => (active.document && active.packData ? libraryEntries(active.document, active.packData, graph) : []),
    [active.document, active.packData, graph],
  );

  return (
    <>
      <AppShell
        document={info}
        tabs={<DocumentTabs />}
        canvas={
          info ? (
            <DocumentCanvas
              {...active}
              subgraph={subgraph}
              placement={placement}
              onSelectionChange={onSelectionChange}
            />
          ) : (
            <WelcomeCanvas loaded={loaded} />
          )
        }
        selection={inspected}
        {...(info && {
          library: (
            <BlueprintLibrary
              entries={entries}
              placing={placement.placing}
              collapseKeys={keysOf("subgraph.collapse")}
              onPick={placement.pick}
              onPlaceInView={placement.placeInView}
              onDrop={placement.drop}
              onCancel={placement.cancel}
            />
          ),
        })}
      />
      <NewDocumentDialog />
      <McpHost />
      <CheatSheet />
      {info && <TourCard />}
    </>
  );
}

interface Selection {
  documentId: string;
  graph: string;
  nodeIds: string[];
}

/**
 * The active document on the canvas, at the subgraph level it's opened to, with its live results; a hint how to
 * start while it's empty. The overlays (totals, heatmap, overviews) describe the graph on screen.
 */
function DocumentCanvas({
  info,
  document,
  packData,
  subgraph,
  placement,
  onSelectionChange,
}: ActiveDocument & {
  subgraph: SubgraphView;
  placement: BlueprintPlacement;
  onSelectionChange(nodeIds: string[]): void;
}) {
  const { graph, results, viewport, motion, onOpenSubgraph, header } = subgraph;
  const shown = useMemo(() => document && scopedTo(document, graph), [document, graph]);
  const overlays = useFactoryOverlays({ info, document: shown, pack: packData, results });
  const empty = !shown || Object.keys(shown.graph.nodes).length === 0;
  return (
    <>
      {/* A canvas per level: diving into a subgraph grows its canvas in, coming back up settles the one above. */}
      <div key={graph} className={`canvas-backdrop absolute inset-0 ${motion ? `subgraph-${motion}` : ""}`}>
        <Canvas
          {...(document && { document })}
          {...(packData && { pack: packData })}
          results={results}
          graph={graph}
          {...(viewport && { viewport })}
          onSelectionChange={onSelectionChange}
          onOpenSubgraph={onOpenSubgraph}
          header={header}
          {...overlays.canvas}
          // A blueprint on its way from the library takes the ghost while it follows the pointer.
          {...placement.canvas}
        />
      </div>
      {overlays.layers}
      {empty && !overlays.previewing && (
        <EmptyState hint={`Search for a recipe with ${shortcutOf(paletteCommandId)}, then build from its ports.`} />
      )}
    </>
  );
}

const shortcutOf = (id: string) => keysOf(id)?.join(" ") ?? "the command palette";

function keysOf(id: string): string[] | undefined {
  const shortcut = appRegistry.get(id)?.shortcut;
  return shortcut ? formatShortcut(shortcut, platformOf(navigator.platform)) : undefined;
}

/** The canvas backdrop with the welcome over it, once we know nothing is open (no flash while loading). */
function WelcomeCanvas({ loaded }: { loaded: boolean }) {
  return (
    <>
      <div className="canvas-backdrop absolute inset-0">
        <Canvas />
      </div>
      {loaded && <Welcome />}
    </>
  );
}

/**
 * The inspector's view of the active document: its selected nodes (in the graph on screen), its save profile while
 * none is selected.
 */
function useInspected(
  { info, document, packData }: ActiveDocument,
  { graph, results }: SubgraphView,
  selection: Selection | null,
): InspectorPanelProps["selection"] {
  const plugin = usePluginDescription(info?.packId, document?.settings.plugin);
  return useMemo(() => {
    const current = selection?.documentId === info?.id && selection?.graph === graph ? selection : null;
    const nodeId = current?.nodeIds.length === 1 ? current.nodeIds[0] : undefined;
    if (!info || !document || !packData) return null;
    if (!current || current.nodeIds.length === 0) {
      const settings = document.settings.plugin ?? {};
      return {
        profile: { documentId: info.id, pack: packData, settings, plugin, planning: document.settings.planning },
      };
    }
    // The inspector reads the root graph: inside a subgraph, it's given the blueprint's graph as the root.
    const shown = scopedTo(document, graph);
    if (!nodeId) {
      // Several nodes: the plugin fields they share, edited on all of them at once.
      const nodeIds = current.nodeIds;
      const node = inspectSelection({
        document: shown,
        pack: packData,
        results: results ?? undefined,
        nodeIds,
        plugin,
      });
      const [first] = nodeIds;
      return node && first ? { target: { documentId: info.id, nodeId: first, nodeIds, graph }, node } : null;
    }
    const node = inspectNode({ document: shown, pack: packData, results: results ?? undefined, nodeId, plugin });
    if (!node) return null;
    return {
      target: { documentId: info.id, nodeId, graph },
      node,
      productionEdit: (value) => {
        const edit = productionEdit(shown, packData, nodeId, value);
        return edit && { ...edit, commands: edit.commands.map((command) => ({ ...command, graph })) };
      },
    };
  }, [selection, info, document, packData, results, plugin, graph]);
}

/** Opens the document of a share link the page was opened with, then removes it from the address bar. */
function useOpenSharedDocument() {
  const connector = useConnector();
  const { workspace } = useModels();
  useEffect(() => {
    const fragment = sharedDocumentIn(location.hash);
    if (!fragment) return;
    history.replaceState(null, "", location.pathname + location.search);
    connector.workspace
      .openShareLink({ fragment })
      .then(async (result) => {
        if (!result.ok) {
          toast({
            title: "Couldn't open the shared factory",
            description: "The link is damaged or incomplete.",
            tone: "error",
          });
          return;
        }
        await workspace.ready;
        workspace.activate(result.value.id);
        toast({ title: `Opened ${result.value.name}`, description: "A copy of the shared factory.", tone: "success" });
      })
      .catch((error: unknown) =>
        toast({ title: "Couldn't open the shared factory", description: errorMessage(error), tone: "error" }),
      );
  }, [connector, workspace]);
}

/** Tells the person once when last session's documents couldn't all be restored. */
function useReportRestoreProblems() {
  const connector = useConnector();
  useEffect(() => {
    void connector.workspace.getRestoreProblems({}).then((problems) => {
      if (problems.length === 0) return;
      toast({
        title: `${problems.length === 1 ? "A factory" : `${problems.length} factories`} from last time couldn't be reopened`,
        description: problems.map((problem) => problem.message).join("; "),
        tone: "error",
      });
    });
  }, [connector]);
}
