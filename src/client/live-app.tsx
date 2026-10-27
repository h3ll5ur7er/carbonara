// The app as people use it: the shell around the open documents, kept in sync with the backend.
// (Scenes render `AppShell` with fixed data instead.)
import { useEffect } from "react";
import { Canvas } from "./canvas/canvas";
import { AppShell, EmptyCanvas } from "./shell/app-shell";
import { useConnector } from "./core/connector";
import { useActiveDocument, useModels, useWorkspace } from "./core/models";
import { createDocumentActions, setDocumentActions } from "./features/documents/actions";
import { DocumentTabs } from "./features/documents/document-tabs";
import { sharedDocumentIn } from "./features/documents/links";
import { NewDocumentDialog } from "./features/documents/new-document-dialog";
import { Welcome } from "./features/documents/welcome";
import { errorMessage, toast } from "./shell/toasts";

export function LiveApp() {
  const connector = useConnector();
  const { workspace } = useModels();
  const loaded = useWorkspace((state) => state.loaded);
  const { info } = useActiveDocument();

  useEffect(() => {
    setDocumentActions(createDocumentActions(connector, workspace));
    return () => setDocumentActions(null);
  }, [connector, workspace]);

  useOpenSharedDocument();
  useReportRestoreProblems();

  return (
    <>
      <AppShell
        document={info}
        tabs={<DocumentTabs />}
        canvas={info ? <EmptyCanvas /> : <WelcomeCanvas loaded={loaded} />}
      />
      <NewDocumentDialog />
    </>
  );
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
