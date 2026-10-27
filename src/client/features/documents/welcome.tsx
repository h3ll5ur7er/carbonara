// What the canvas shows when no factory is open: a way to start one, to open a file, or to reopen one of the
// factories closed recently. The first run asks which game you play instead (the onboarding's game picker).
import { FilePlus, FolderOpen, History } from "lucide-react";
import { useEffect, useState } from "react";
import type { RecentDocument } from "../../../contracts/managers";
import { useConnector } from "../../core/connector";
import { useModels } from "../../core/models";
import { errorMessage, toast } from "../../shell/toasts";
import { Button } from "../../ui/button";
import { GamePicker } from "../onboarding/game-picker";
import { useTour } from "../onboarding/tour-store";
import { firstRunSuppressed } from "../onboarding/use-onboarding";
import { usePacks } from "../packs/use-packs";
import { documentActions } from "./actions";
import { closedAgo } from "./recent";

export function Welcome() {
  const loaded = useTour((state) => state.loaded);
  const picking = useTour((state) => state.pickingGame || (state.progress === undefined && !firstRunSuppressed()));
  if (!loaded) return null;
  return picking ? <GamePicker /> : <StartOrReopen />;
}

function StartOrReopen() {
  const recent = useRecent();
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto">
      <div className="canvas-clearing flex w-full max-w-md flex-col items-center gap-5 px-16 py-14 text-center">
        <div className="flex flex-col gap-1.5">
          <p className="text-xl font-semibold tracking-tight text-fg">Plan your next factory</p>
          <p className="text-sm text-fg-subtle">
            Start an empty factory for one of your games, or open a <span className="font-mono">.carbonara</span> file.
            Shared links open here too.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={documentActions.newDocument}>
            <FilePlus className="size-4" aria-hidden />
            New factory
          </Button>
          <Button onClick={documentActions.openFile}>
            <FolderOpen className="size-4" aria-hidden />
            Open file…
          </Button>
        </div>
        {recent.documents.length > 0 && <RecentList {...recent} />}
      </div>
    </div>
  );
}

/** The recently closed factories, newest first, and how to reopen one. */
function useRecent() {
  const connector = useConnector();
  const { workspace } = useModels();
  const [documents, setDocuments] = useState<RecentDocument[]>([]);
  useEffect(() => {
    let current = true;
    connector.workspace
      .listRecent({})
      .then((list) => current && setDocuments(list))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [connector]);

  async function reopen(document: RecentDocument): Promise<void> {
    try {
      const result = await connector.workspace.openRecent({ documentId: document.id });
      if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join("; "));
      await workspace.ready;
      workspace.activate(result.value.id);
    } catch (error) {
      toast({ title: `Couldn't reopen ${document.name}`, description: errorMessage(error), tone: "error" });
      setDocuments(await connector.workspace.listRecent({}).catch(() => []));
    }
  }
  return { documents, reopen };
}

function RecentList({ documents, reopen }: ReturnType<typeof useRecent>) {
  const packs = usePacks();
  const gameOf = (packId: string) => {
    const manifest = packs?.find((pack) => pack.manifest.id === packId)?.manifest;
    return manifest?.game?.name ?? manifest?.name ?? packId;
  };
  // When the list was shown: "5 minutes ago" needn't tick while someone reads it.
  const [now] = useState(Date.now);
  return (
    <section aria-labelledby="recent-title" className="mt-3 flex w-full flex-col gap-1.5 text-left">
      <h2
        id="recent-title"
        className="flex items-center gap-1.5 px-2.5 text-2xs font-semibold tracking-wide text-fg-subtle uppercase"
      >
        <History className="size-3" aria-hidden />
        Recent
      </h2>
      <ul className="flex flex-col">
        {documents.map((document) => (
          <li key={document.id}>
            <button
              type="button"
              onClick={() => void reopen(document)}
              className={
                "group flex w-full items-baseline gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors " +
                "hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 " +
                "focus-visible:ring-accent"
              }
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-muted group-hover:text-fg">
                {document.name}
              </span>
              <span className="shrink-0 text-xs text-fg-subtle">
                {gameOf(document.packId)} · {closedAgo(document.closedAt, now)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
