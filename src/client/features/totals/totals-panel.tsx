// The totals dashboard: what the whole factory adds up to, at the canvas's bottom-left. Collapsed, a pill with
// machines, power and any raw resource over the map's limit; expanded (click it, or `T`), a card with raw
// resources against the map's limits, power, buildings, outputs and shortages. It follows the latest solve.
import { ChevronDown, ChevronUp, LogOut, Sigma, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { create } from "zustand";
import type { Document } from "../../../contracts/document";
import type { PackData, RateUnit } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import { formatNumber } from "../../canvas/model/format";
import { usePanels } from "../../shell/panels";
import { IconButton } from "../../ui/button";
import { cx } from "../../ui/cx";
import { factorySummary, namedRates, summaryFacts } from "./summary";
import { BuildingRows, ItemRows, RawRows, Shortfalls, SummaryList, SummaryStats } from "./summary-view";

/** Whether the card is expanded; the `view.toggleTotals` command flips it. */
export const useTotals = create<{ expanded: boolean }>(() => ({ expanded: false }));

export function toggleTotals(): void {
  useTotals.setState(({ expanded }) => ({ expanded: !expanded }));
}

const WIDTH = 344;
const MARGIN = 12;

/** The room the expanded card takes at the canvas's left, for the canvas to keep fitted graphs clear of. */
export function useTotalsReserved(): { left: number } | undefined {
  const expanded = useTotals((state) => state.expanded);
  return expanded ? { left: WIDTH + MARGIN } : undefined;
}

export interface TotalsPanelProps {
  document: Document;
  pack: PackData;
  results: AnalysisResults | null;
  rateUnit: RateUnit;
}

export function TotalsPanel({ document, pack, results, rateUnit }: TotalsPanelProps) {
  const expanded = useTotals((state) => state.expanded);
  const library = usePanels((panels) => panels.left);
  const summary = useMemo(
    () => (results && results.documentId === document.id ? factorySummary(document, pack, results) : null),
    [document, pack, results],
  );
  const facts = useMemo(() => summary && summaryFacts(summary, pack), [summary, pack]);
  if (!summary || !facts || Object.keys(document.graph.nodes).length === 0) return null;

  const over = facts.raw.filter(
    (entry) => entry.limitPerSecond !== undefined && entry.perSecond > entry.limitPerSecond,
  );
  const outputs = namedRates(summary.outputs, pack);
  const left = library.open ? library.width + 2 * MARGIN : MARGIN;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={toggleTotals}
        aria-expanded={false}
        aria-label="Totals"
        style={{ left }}
        className={cx(
          "absolute bottom-3 z-10 flex h-9 animate-fade-in items-center gap-3 rounded-full bg-glass py-1 pr-3 pl-1.5",
          "text-xs text-fg-muted shadow-panel backdrop-blur-glass backdrop-saturate-150 transition-colors hover:text-fg",
        )}
      >
        <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-accent-fg">
          <Sigma className="size-3.5" aria-hidden />
        </span>
        <span>
          <span className="font-mono text-fg">{formatNumber(facts.machines)}</span> machines
        </span>
        <span className="h-3.5 w-px bg-line" aria-hidden />
        <span>
          <span className="font-mono text-fg">{formatNumber(summary.powerMW)}</span> MW
        </span>
        {over.length > 0 && (
          <>
            <span className="h-3.5 w-px bg-line" aria-hidden />
            <span className="flex items-center gap-1 text-flow-over-capacity">
              <TriangleAlert className="size-3.5" aria-hidden />
              {over.length === 1 ? `${over[0]?.item.name} over the map` : `${over.length} resources over the map`}
            </span>
          </>
        )}
        <ChevronUp className="size-3.5 text-fg-subtle" aria-hidden />
      </button>
    );
  }

  return (
    <section
      aria-label="Totals"
      style={{ left, width: WIDTH }}
      className={cx(
        "absolute bottom-3 z-10 flex max-h-[calc(100%-1.5rem)] animate-rise-in flex-col rounded-xl bg-glass shadow-overlay",
        "backdrop-blur-glass backdrop-saturate-150",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") toggleTotals();
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-subtle pr-1.5 pl-4">
        <Sigma className="size-3.5 text-accent-fg" aria-hidden />
        <h2 className="flex-1 truncate text-xs font-semibold tracking-wide text-fg-muted uppercase">Totals</h2>
        <IconButton label="Collapse totals" shortcut={["T"]} icon={<ChevronDown />} size="sm" onClick={toggleTotals} />
      </header>
      <div className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 pt-3.5 pb-4">
          <SummaryStats facts={facts} powerMW={summary.powerMW} unit={rateUnit} />
          <Shortfalls title="Short of inputs" shortfalls={facts.shortfalls} unit={rateUnit} />
        </div>
        <SummaryList title="Raw resources">
          <RawRows raw={facts.raw} unit={rateUnit} />
        </SummaryList>
        <SummaryList title="Buildings">
          <BuildingRows buildings={facts.buildings} />
        </SummaryList>
        {outputs.length > 0 && (
          <SummaryList title="Outputs" icon={<LogOut />}>
            <ItemRows rates={outputs} unit={rateUnit} />
          </SummaryList>
        )}
      </div>
    </section>
  );
}
