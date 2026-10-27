// The goal planner: a card floating at the canvas's top-left. Write goals (items and rates in the document's
// unit) and options, plan, and the proposal appears on the canvas as a ghost while the card sums it up
// (machines, power, raw inputs against the map, byproducts, shortfalls). Accept adds it as one undo step,
// Adjust goes back to the goals (the proposal's) with the ghost still shown, Discard drops it. Proposals an MCP
// client makes open here too (`followProposals`).
import { Check, ChevronRight, Plus, Recycle, Undo2, WandSparkles, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { PlanOptions } from "../../../contracts/managers";
import type { PackData, RateUnit } from "../../../contracts/pack";
import type { Point } from "../../canvas/adapter";
import type { Ghost } from "../../canvas/ghost/ghost";
import { ItemChip, Rate } from "../../canvas/parts";
import { useConnector } from "../../core/connector";
import { usePanels } from "../../shell/panels";
import { errorMessage, toast } from "../../shell/toasts";
import { Button, IconButton } from "../../ui/button";
import { cx } from "../../ui/cx";
import { NumberInput } from "../../ui/number-input";
import { Select } from "../../ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { Switch } from "../../ui/toggle";
import { ItemPicker } from "./item-picker";
import { summaryFacts } from "../totals/summary";
import {
  BuildingRows,
  ItemRows,
  RawRows,
  SectionTitle,
  Shortfalls,
  SummaryList,
  SummaryStats,
} from "../totals/summary-view";
import {
  buildingFamilies,
  goalsOf,
  planLabel,
  preferBuilding,
  proposalGhost,
  targetsPerSecond,
  type GoalRow,
} from "./plan";
import { closePlanner, newGoal, newGoalKey, resetPlanner, usePlanner, type PlannerState } from "./planner-store";
import { fromPerSecond, rateSuffix } from "../../../utilities/units";

/** The card's width, in pixels; the canvas keeps fitted graphs clear of it. */
export const PLANNER_WIDTH = 344;
/** The gap the floating panels keep from the canvas edges and each other. */
const MARGIN = 12;
const ORIGIN = { x: 0, y: 0 };

export interface PlannerTarget {
  document: { id: string; name: string };
  pack: PackData;
  rateUnit: RateUnit;
}

/** What the canvas needs from the planner: the proposal's ghost, its moves, and the room the card takes. */
export function usePlannerCanvas(documentId: string | undefined) {
  const planner = usePlanner();
  // Goals and proposals belong to one document; another one starts afresh.
  useEffect(() => {
    if (documentId !== undefined && planner.documentId !== documentId) resetPlanner(documentId);
  }, [documentId, planner.documentId]);
  const proposal = planner.open && planner.documentId === documentId ? planner.proposal : null;
  const { offset } = planner;
  // The ghost's content follows the proposal, its placement the offset, so moving it doesn't rebuild it.
  const content = useMemo(() => (proposal ? proposalGhost(proposal, ORIGIN) : undefined), [proposal]);
  const ghost = useMemo<Ghost | undefined>(
    () => content && { ...content, placement: { mode: "fixed", offset } },
    [content, offset],
  );
  return {
    ghost,
    onGhostPlace: (offset: Point) => usePlanner.setState({ offset }),
    reserved: planner.open ? { left: PLANNER_WIDTH + MARGIN } : undefined,
  };
}

/** Closes the planner, discarding its proposal if it has one: the planning manager stops waiting for it. */
function useDiscard() {
  const connector = useConnector();
  return () => {
    const { proposal } = usePlanner.getState();
    closePlanner();
    if (proposal) void connector.planning.discardProposal({ proposalId: proposal.id }).catch(() => undefined);
  };
}

export function PlannerPanel({ document, pack, rateUnit }: PlannerTarget) {
  const planner = usePlanner();
  const discard = useDiscard();
  const library = usePanels((panels) => panels.left);
  if (!planner.open || planner.documentId !== document.id) return null;
  const left = library.open ? library.width + 2 * MARGIN : MARGIN;
  return (
    <section
      aria-label="Plan production"
      style={{ left, width: PLANNER_WIDTH }}
      className={cx(
        "absolute top-3 z-20 flex max-h-[calc(100%-1.5rem)] animate-rise-in flex-col rounded-xl bg-glass shadow-overlay",
        "backdrop-blur-glass backdrop-saturate-150",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) discard();
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-subtle pr-1.5 pl-4">
        <WandSparkles className="size-3.5 text-accent-fg" aria-hidden />
        <h2 className="flex-1 truncate text-xs font-semibold tracking-wide text-fg-muted uppercase">
          {planner.stage === "proposal" ? "Proposal" : "Plan production"}
        </h2>
        <IconButton label="Close planner" icon={<X />} size="sm" onClick={discard} />
      </header>
      {planner.stage === "proposal" && planner.proposal ? (
        <ProposalCard planner={planner} pack={pack} rateUnit={rateUnit} />
      ) : planner.stage === "accepted" ? (
        <Accepted document={document} />
      ) : (
        <GoalsForm planner={planner} document={document} pack={pack} rateUnit={rateUnit} />
      )}
    </section>
  );
}

function GoalsForm({ planner, document, pack, rateUnit }: PlannerTarget & { planner: PlannerState }) {
  const connector = useConnector();
  const objectiveId = useId();
  const alternatesId = useId();
  const { goals, options, stage, error } = planner;
  const planning = stage === "planning";
  const unit = rateSuffix(rateUnit);

  const setGoal = (key: number, change: Partial<GoalRow>) =>
    usePlanner.setState({ goals: goals.map((goal) => (goal.key === key ? { ...goal, ...change } : goal)) });

  async function plan() {
    const targets = targetsPerSecond(goals, rateUnit);
    if (targets.length === 0) {
      usePlanner.setState({ error: "Pick an item and a rate to plan for." });
      return;
    }
    usePlanner.setState({ stage: "planning", error: null });
    try {
      const result = await connector.planning.planProduction({ documentId: document.id, targets, options });
      if (result.ok) usePlanner.setState({ stage: "proposal", proposal: result.value, offset: { x: 0, y: 0 } });
      else usePlanner.setState({ stage: "goals", error: result.error.map((issue) => issue.message).join(" ") });
    } catch (failure) {
      usePlanner.setState({ stage: "goals", error: errorMessage(failure) });
    }
  }

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void plan();
      }}
    >
      <div className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
          <SectionTitle>Goals</SectionTitle>
          {goals.map((goal, index) => (
            <div key={goal.key} className="relative flex items-center gap-1.5">
              <ItemPicker
                pack={pack}
                value={goal.item}
                aria-label={`Goal ${index + 1} item`}
                autoFocus={index === 0 && goal.item === null}
                onValueChange={(item) =>
                  setGoal(goal.key, { item, rate: goal.rate > 0 ? goal.rate : fromPerSecond(1, rateUnit) })
                }
              />
              <NumberInput
                aria-label={`Goal ${index + 1} rate`}
                className="w-28 shrink-0"
                value={goal.rate}
                min={0}
                max={1e9}
                unit={unit}
                onValueChange={(rate) => setGoal(goal.key, { rate })}
              />
              {goals.length > 1 && (
                <IconButton
                  label={`Remove goal ${index + 1}`}
                  icon={<X />}
                  size="sm"
                  onClick={() => usePlanner.setState({ goals: goals.filter((other) => other.key !== goal.key) })}
                />
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => usePlanner.setState({ goals: [...goals, newGoal()] })}
          >
            <Plus /> Add a goal
          </Button>
        </div>
        <div className="flex flex-col gap-3 border-t border-line-subtle px-4 pt-3.5 pb-4">
          <SectionTitle>Options</SectionTitle>
          <div className="flex items-center justify-between gap-3">
            <span id={objectiveId} className="text-sm text-fg-muted">
              Use as few
            </span>
            <Tabs
              value={options.objective}
              onValueChange={(objective) =>
                usePlanner.setState({ options: { ...options, objective: objective as typeof options.objective } })
              }
            >
              <TabsList aria-label="Use as few" className="w-44">
                <TabsTrigger value="resources" panel={false}>
                  Resources
                </TabsTrigger>
                <TabsTrigger value="buildings" panel={false}>
                  Buildings
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={alternatesId} className="text-sm text-fg-muted">
              Alternate recipes
            </label>
            <Switch
              id={alternatesId}
              checked={options.alternates}
              onCheckedChange={(alternates) => usePlanner.setState({ options: { ...options, alternates } })}
            />
          </div>
          <BuildingChoices pack={pack} options={options} />
          <ResourceWeights pack={pack} options={options} />
        </div>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-subtle px-4 py-3">
        <p role={error ? "alert" : undefined} className="min-w-0 flex-1 text-xs text-danger">
          {error}
        </p>
        {planner.proposal && (
          <Button variant="ghost" onClick={() => usePlanner.setState({ stage: "proposal" })}>
            Back
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={planning}>
          <WandSparkles /> {planning ? "Planning…" : "Plan"}
        </Button>
      </footer>
    </form>
  );
}

/** Which building each family's recipes run in (`PlanOptions.buildings`): one row per family with a choice. */
function BuildingChoices({ pack, options }: { pack: PackData; options: PlanOptions }) {
  const families = useMemo(() => buildingFamilies(pack), [pack]);
  return families.map((family) => {
    const chosen = family.members.find((member) => options.buildings.includes(member.id)) ?? family.base;
    const label = `Recipes for the ${family.base.name} run in`;
    return (
      <div key={family.base.id} className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-fg-muted">{family.base.name}</span>
        <Select
          aria-label={label}
          size="sm"
          className="w-44 shrink-0"
          value={chosen.id}
          options={family.members.map((member) => ({ value: member.id, label: member.name }))}
          onValueChange={(choice) =>
            usePlanner.setState({
              options: { ...options, buildings: preferBuilding(options.buildings, family, choice) },
            })
          }
        />
      </div>
    );
  });
}

/**
 * How much one item per second of each raw resource weighs against the others (`PlanOptions.resourceWeights`),
 * folded away until it's wanted: most plans need none.
 */
function ResourceWeights({ pack, options }: { pack: PackData; options: PlanOptions }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const changed = Object.keys(options.resourceWeights).length;
  if (pack.resources.length === 0) return null;
  const setWeight = (item: string, weight: number) => {
    const { [item]: _dropped, ...others } = options.resourceWeights;
    usePlanner.setState({
      options: { ...options, resourceWeights: weight === 1 ? others : { ...others, [item]: weight } },
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className={cx(
          "-mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm text-fg-muted",
          "outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent",
        )}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight className={cx("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
        <span className="flex-1">Resource weights</span>
        <span className="text-xs text-fg-subtle">{changed > 0 ? `${changed} changed` : "all 1"}</span>
      </button>
      {open && (
        <ul id={panelId} aria-label="Resource weights" className="flex flex-col gap-1.5">
          {pack.resources.map(({ item: id }) => {
            const item = items.get(id) ?? { id, name: id, form: "solid" as const };
            return (
              <li key={id} className="flex items-center gap-2">
                <ItemChip item={item} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.name}</span>
                <NumberInput
                  aria-label={`Weight of ${item.name}`}
                  className="w-24 shrink-0"
                  value={options.resourceWeights[id] ?? 1}
                  min={0.01}
                  max={1000}
                  step={0.5}
                  onValueChange={(weight) => setWeight(id, weight)}
                />
              </li>
            );
          })}
          <li className="text-xs text-fg-subtle">
            Each item a second costs its weight; plans use as little weight as they can.
          </li>
        </ul>
      )}
    </div>
  );
}

function ProposalCard({ planner, pack, rateUnit }: { planner: PlannerState; pack: PackData; rateUnit: RateUnit }) {
  const connector = useConnector();
  const discard = useDiscard();
  const proposal = planner.proposal;
  if (!proposal) return null;
  const facts = summaryFacts(proposal.summary, pack);
  const items = new Map(pack.items.map((item) => [item.id, item]));

  async function accept() {
    if (!proposal) return;
    const label = planLabel(proposal.targets, pack, rateUnit);
    try {
      const result = await connector.editing.applyProposal({ proposalId: proposal.id, label, offset: planner.offset });
      if (result.ok) usePlanner.setState({ stage: "accepted", proposal: null, offset: { x: 0, y: 0 } });
      else
        toast({
          tone: "error",
          title: "Couldn't add the plan",
          description: `${result.error.map((issue) => issue.message).join(" ")} Plan again to start afresh.`,
        });
    } catch (failure) {
      toast({ tone: "error", title: "Couldn't add the plan", description: errorMessage(failure) });
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 pt-3.5 pb-4">
          <ul aria-label="Goals" className="flex flex-wrap gap-1.5">
            {proposal.targets.map((target) => {
              const item = items.get(target.item) ?? { id: target.item, name: target.item, form: "solid" as const };
              return (
                <li
                  key={target.item}
                  className="flex items-center gap-1.5 rounded-full bg-surface-3 py-0.5 pr-2.5 pl-0.5 text-xs text-fg"
                >
                  <ItemChip item={item} size="sm" />
                  <Rate perSecond={target.perSecond} unit={rateUnit} className="text-xs" />
                  <span>{item.name}</span>
                </li>
              );
            })}
          </ul>
          <SummaryStats facts={facts} powerMW={proposal.summary.powerMW} unit={rateUnit} />
          <Shortfalls title="The map can’t supply all of it" shortfalls={facts.shortfalls} unit={rateUnit} alert />
        </div>
        <SummaryList title="Buildings">
          <BuildingRows buildings={facts.buildings} />
        </SummaryList>
        <SummaryList title="Raw inputs">
          <RawRows raw={facts.raw} unit={rateUnit} />
        </SummaryList>
        {facts.byproducts.length > 0 && (
          <SummaryList title="Byproducts" icon={<Recycle />}>
            <ItemRows rates={facts.byproducts} unit={rateUnit} />
          </SummaryList>
        )}
      </div>
      <footer className="flex shrink-0 items-center gap-2 border-t border-line-subtle px-4 py-3">
        <Button variant="ghost" onClick={discard}>
          Discard
        </Button>
        <Button
          className="ml-auto"
          onClick={() =>
            usePlanner.setState({ stage: "goals", goals: goalsOf(proposal.targets, rateUnit, newGoalKey) })
          }
        >
          Adjust
        </Button>
        <Button variant="primary" autoFocus onClick={() => void accept()}>
          <Check /> Accept
        </Button>
      </footer>
    </>
  );
}

function Accepted({ document }: { document: { id: string; name: string } }) {
  const connector = useConnector();
  async function undo() {
    try {
      await connector.editing.undo({ documentId: document.id });
      closePlanner();
      toast({ title: "Removed the plan" });
    } catch (failure) {
      toast({ tone: "error", title: "Couldn't undo", description: errorMessage(failure) });
    }
  }
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-success inset-ring inset-ring-line-subtle">
          <Check className="size-4.5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-fg">Added to {document.name}</p>
          <p className="text-xs text-fg-subtle">One step in the history: undo takes all of it back.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => usePlanner.setState({ stage: "goals", error: null })}>
          Plan more
        </Button>
        <Button onClick={() => void undo()}>
          <Undo2 /> Undo
        </Button>
        <Button variant="primary" autoFocus onClick={closePlanner}>
          Done
        </Button>
      </div>
    </div>
  );
}
