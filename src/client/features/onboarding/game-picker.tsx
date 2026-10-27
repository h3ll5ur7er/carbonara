// The first run's welcome: which game do you play? Picking one opens that pack's starter factory (an empty one
// when the pack has none) and starts the tour. "Take the tour" with nothing open asks the same.
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { PackInfo } from "../../../contracts/managers";
import { useConnector } from "../../core/connector";
import { useModels } from "../../core/models";
import { errorMessage, toast } from "../../shell/toasts";
import { Button } from "../../ui/button";
import { cx } from "../../ui/cx";
import { Mark } from "../../ui/mark";
import { packAccentStyle } from "../../ui/theme";
import { usePacks } from "../packs/use-packs";
import { setPickingGame, skipTour, startTour, useTour } from "./tour-store";
import "./onboarding.css";

export function GamePicker() {
  const connector = useConnector();
  const { workspace, packData } = useModels();
  const packs = usePacks();
  const firstRun = useTour((state) => state.progress === undefined);
  const [opening, setOpening] = useState<string | null>(null);

  async function play(pack: PackInfo) {
    const packId = pack.manifest.id;
    setOpening(packId);
    try {
      const [starter] = (await packData(packId)).starters;
      const document = await connector.workspace.createDocument({
        name: starter?.name ?? `My ${pack.manifest.game?.name ?? pack.manifest.name} factory`,
        packId,
        ...(starter && { starter: starter.id }),
      });
      await workspace.ready;
      workspace.activate(document.id);
      startTour();
    } catch (error) {
      toast({ title: "Couldn't open the starter factory", description: errorMessage(error), tone: "error" });
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto">
      <section
        aria-labelledby="game-picker-title"
        className="canvas-clearing flex max-w-3xl flex-col items-center gap-8 px-16 py-14 text-center"
      >
        <div className="flex flex-col items-center gap-3">
          <Mark className="size-10" />
          <h1 id="game-picker-title" className="text-3xl font-semibold tracking-tight text-fg">
            {firstRun ? "Welcome to Carbonara" : "Take the tour"}
          </h1>
          <p className="max-w-md text-base text-balance text-fg-muted">
            Which game do you play? We’ll open a small starter factory for it and show you around — it takes a minute.
          </p>
        </div>
        <ul aria-label="Games" className="flex w-full flex-wrap justify-center gap-3">
          {packs?.map((pack) => (
            <li key={pack.manifest.id} className="w-48">
              <GameCard pack={pack} opening={opening} onPick={() => void play(pack)} />
            </li>
          ))}
        </ul>
        <Button variant="ghost" onClick={firstRun ? skipTour : () => setPickingGame(false)} disabled={!!opening}>
          {firstRun ? "Skip — I’ll find my own way" : "Back"}
        </Button>
      </section>
    </div>
  );
}

function GameCard({ pack, opening, onPick }: { pack: PackInfo; opening: string | null; onPick(): void }) {
  const { manifest } = pack;
  const busy = opening === manifest.id;
  const game = manifest.game?.name ?? manifest.name;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={opening !== null}
      aria-busy={busy}
      style={packAccentStyle(manifest.theme?.accent)}
      className={cx(
        "game-card group flex w-full flex-col items-start gap-4 rounded-xl bg-surface-2 p-4 text-left shadow-panel",
        "transition-[box-shadow,transform] hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none",
        "disabled:pointer-events-none",
        opening !== null && !busy && "opacity-45",
      )}
    >
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-lg bg-accent text-xl font-semibold text-on-accent shadow-sm"
      >
        {monogram(game)}
      </span>
      <span className="flex w-full items-end justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-base font-semibold text-fg">{game}</span>
          <span className="truncate text-xs text-fg-subtle">
            {manifest.game?.version ? `Version ${manifest.game.version}` : `Pack ${manifest.version}`}
          </span>
        </span>
        {busy ? (
          <LoaderCircle
            className="size-4 shrink-0 animate-spin text-accent-fg motion-reduce:animate-none"
            aria-hidden
          />
        ) : (
          <ArrowRight
            className="size-4 shrink-0 text-fg-faint transition-colors group-hover:text-accent-fg group-focus-visible:text-accent-fg"
            aria-hidden
          />
        )}
      </span>
    </button>
  );
}

/** The first letters of a game's first two words: "Template Works" → "TW". */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
