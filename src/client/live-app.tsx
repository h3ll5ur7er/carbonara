// The app as people use it: the shell around the open documents, kept in sync with the backend.
// (Scenes render `AppShell` with fixed data instead.)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "./canvas/canvas";
import { formatShortcut, platformOf } from "./core/commands-shortcuts";
import { paletteCommandId } from "./features/command-palette/command-palette";
import { appRegistry } from "./shell/app-commands";
import { AppShell, EmptyState } from "./shell/app-shell";
import { inspectNode, productionEdit } from "./shell/inspector/inspect";
import type { InspectorPanelProps } from "./shell/inspector/inspector-panel";
import { usePluginDescription } from "./shell/inspector/plugin-description";
import { useConnector } from "./core/connector";
import { useActiveDocument, useModels, useWorkspace, type ActiveDocument } from "./core/models";
import { createDocumentActions, setDocumentActions } from "./features/documents/actions";
import { DocumentTabs } from "./features/documents/document-tabs";
import { sharedDocumentIn } from "./features/documents/links";
import { NewDocumentDialog } from "./features/documents/new-document-dialog";
import { useFactoryOverlays } from "./features/planner/factory-overlays";
import { CheatSheet } from "./features/shortcuts/cheat-sheet";
import { Welcome } from "./features/documents/welcome";
import { McpHost } from "./features/mcp/host";
import { TourCard } from "./features/onboarding/tour-card";
import { useOnboarding } from "./features/onboarding/use-onboarding";
import { errorMessage, toast } from "./shell/toasts";

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

  useOpenSharedDocument();
  useReportRestoreProblems();
  useOnboarding(active);
  const [selection, setSelection] = useState<{ documentId: string; nodeIds: string[] } | null>(null);
  const onSelectionChange = useCallback(
    (nodeIds: string[]) => setSelection(info ? { documentId: info.id, nodeIds } : null),
    [info],
  );
  const inspected = useInspected(active, selection);

  return (
    <>
      <AppShell
        document={info}
        tabs={<DocumentTabs />}
        canvas={
          info ? (
            <DocumentCanvas {...active} onSelectionChange={onSelectionChange} />
          ) : (
            <WelcomeCanvas loaded={loaded} />
          )
        }
        selection={inspected}
      />
      <NewDocumentDialog />
      <McpHost />
      <CheatSheet />
      {info && <TourCard />}
    </>
  );
}

/** The active document on the canvas, with its live results; a hint how to start while it's empty. */
function DocumentCanvas({
  info,
  document,
  packData,
  results,
  onSelectionChange,
}: ActiveDocument & { onSelectionChange(nodeIds: string[]): void }) {
  const overlays = useFactoryOverlays({ info, document, pack: packData, results: results ?? null });
  const empty = !document || Object.keys(document.graph.nodes).length === 0;
  return (
    <>
      <div className="canvas-backdrop absolute inset-0">
        <Canvas
          {...(document && { document })}
          {...(packData && { pack: packData })}
          results={results ?? null}
          onSelectionChange={onSelectionChange}
          {...overlays.canvas}
        />
      </div>
      {overlays.layers}
      {empty && !overlays.previewing && (
        <EmptyState hint={`Search for a recipe with ${shortcutOf(paletteCommandId)}, then build from its ports.`} />
      )}
    </>
  );
}

const shortcutOf = (id: string) => {
  const shortcut = appRegistry.get(id)?.shortcut;
  return shortcut ? formatShortcut(shortcut, platformOf(navigator.platform)).join(" ") : "the command palette";
};

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

/** The inspector's view of the active document: its one selected node, its save profile while none is selected. */
function useInspected(
  { info, document, packData, results }: ActiveDocument,
  selection: { documentId: string; nodeIds: string[] } | null,
): InspectorPanelProps["selection"] {
  const plugin = usePluginDescription(info?.packId, document?.settings.plugin);
  return useMemo(() => {
    const nodeId =
      selection?.documentId === info?.id && selection?.nodeIds.length === 1 ? selection.nodeIds[0] : undefined;
    if (!info || !document || !packData) return null;
    const selected = selection?.documentId === info.id ? selection.nodeIds.length : 0;
    if (selected === 0) {
      const settings = document.settings.plugin ?? {};
      return { profile: { documentId: info.id, pack: packData, settings, plugin } };
    }
    if (!nodeId) return null;
    const node = inspectNode({ document, pack: packData, results, nodeId, plugin });
    if (!node) return null;
    return {
      target: { documentId: info.id, nodeId },
      node,
      productionEdit: (value) => productionEdit(document, packData, nodeId, value),
    };
  }, [selection, info, document, packData, results, plugin]);
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
