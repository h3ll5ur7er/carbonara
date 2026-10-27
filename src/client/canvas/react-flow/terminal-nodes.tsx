// Where items enter and leave the graph: sources (resources, imports) and sinks (goals, exports).
// Both are pills, so their silhouette alone sets them apart from machines.
import { memo } from "react";
import type { ItemForm } from "../../../contracts/pack";
import { formatNumber, formatRate, type RateDisplay } from "../model/format";
import { monogram } from "../model/item-chip";
import type { LodTier } from "../model/lod";
import type { NodeView } from "../model/scene";
import { ItemChip, Rate, tint } from "../parts";
import { useLod, useNodeSlot, useRateUnit } from "./context";
import { PortHandle } from "./port-handle";
import { cardRing } from "./recipe-node";
import type { FlowNodeProps } from "./types";

export const SourceNode = memo(function SourceNode({ id, data: { view }, selected }: FlowNodeProps<"source">) {
  const slot = useNodeSlot(id);
  const unit = useRateUnit();
  const supplied = slot?.result.outputs[view.item.id] ?? slot?.result.activity;
  const lod = useLod();
  if (lod !== "full") return <TerminalOverview view={view} lod={lod} selected={selected} short={false} />;
  const belts = inBelts(unit, view.item.form);
  return (
    <div
      className={`relative flex size-full items-center gap-3 rounded-full bg-surface-2 pr-6 pl-4 shadow-panel ring-inset ${cardRing(selected, false)}`}
    >
      <ItemChip item={view.item} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-semibold tracking-tight text-fg">{view.item.name}</span>
          {!belts && <Rate perSecond={supplied} unit={unit} form={view.item.form} className="text-xs text-fg" />}
        </div>
        {belts ? (
          <BeltRate perSecond={supplied} of={view.maxPerSecond} unit={unit} form={view.item.form} />
        ) : (
          <span className="truncate text-2xs text-fg-subtle">
            Source
            {view.maxPerSecond !== undefined && (
              <>
                <span className="px-1 text-fg-faint">·</span>
                up to <Rate perSecond={view.maxPerSecond} unit={unit} form={view.item.form} className="text-fg-muted" />
              </>
            )}
          </span>
        )}
      </div>
      {view.ports.map((port) => (
        <PortHandle key={port.handle} port={port} />
      ))}
    </div>
  );
});

export const SinkNode = memo(function SinkNode({ id, data: { view }, selected }: FlowNodeProps<"sink">) {
  const slot = useNodeSlot(id);
  const unit = useRateUnit();
  const delivered = slot?.result.inputs[view.item.id] ?? slot?.result.activity;
  const short = Object.keys(slot?.deficits ?? {}).length > 0;
  const lod = useLod();
  if (lod !== "full") return <TerminalOverview view={view} lod={lod} selected={selected} short={short} />;
  const progress =
    view.targetPerSecond && delivered !== undefined ? Math.min(delivered / view.targetPerSecond, 1) : undefined;
  const belts = inBelts(unit, view.item.form);
  return (
    <div
      className={`relative flex size-full items-center gap-3 rounded-full bg-surface-2 pr-4 pl-6 shadow-panel ring-inset ${cardRing(selected, short)}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-semibold tracking-tight text-fg">{view.item.name}</span>
          {!belts && <Rate perSecond={delivered} unit={unit} form={view.item.form} className="text-xs text-fg" />}
        </div>
        {belts ? (
          <>
            <BeltRate perSecond={delivered} of={view.targetPerSecond} unit={unit} form={view.item.form} />
            {progress !== undefined && (
              <div className="mt-0.5 flex">
                <ProgressBar progress={progress} />
              </div>
            )}
          </>
        ) : progress === undefined ? (
          <span className="text-2xs text-fg-subtle">Output</span>
        ) : (
          <div className="flex items-center gap-2">
            <ProgressBar progress={progress} />
            <span className="font-mono text-2xs text-fg-subtle">
              {formatNumber(progress * 100)}% of{" "}
              <Rate perSecond={view.targetPerSecond} unit={unit} form={view.item.form} />
            </span>
          </div>
        )}
      </div>
      <ItemChip item={view.item} size="lg" />
      {view.ports.map((port) => (
        <PortHandle key={port.handle} port={port} />
      ))}
    </div>
  );
});

/** Whether the item's rates read in belts ("0.73 × Fast Conveyor"): too long to share a row with the name. */
function inBelts(unit: RateDisplay, form: ItemForm): boolean {
  return unit.belt?.form === form;
}

/** A terminal's rate in belts on a line of its own, out of its limit or target if it has one: "0.73 of 1 × Conveyor". */
function BeltRate({
  perSecond,
  of,
  unit,
  form,
}: {
  perSecond: number | undefined;
  of: number | undefined;
  unit: RateDisplay;
  form: ItemForm;
}) {
  if (perSecond === undefined) return <span className="font-mono text-xs text-fg-faint">—</span>;
  const rate = formatRate(perSecond, unit, form);
  const text = `${rate.value}${of === undefined ? "" : ` of ${formatRate(of, unit, form).value}`}${rate.unit}`;
  return (
    <span title={text} className="truncate font-mono text-xs text-fg">
      {rate.value}
      {of !== undefined && <span className="text-fg-subtle"> of {formatRate(of, unit, form).value}</span>}
      <span className="text-fg-subtle">{rate.unit}</span>
    </span>
  );
}

/** How much of a sink's target arrives. */
function ProgressBar({ progress }: { progress: number }) {
  return (
    <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-4">
      <span
        className={`block h-full rounded-full ${progress < 1 ? "bg-flow-near-capacity" : "bg-flow-healthy"}`}
        style={{ width: `${progress * 100}%` }}
      />
    </span>
  );
}

/** A source or sink when zoomed out: the item in large type, then only its colour and monogram. */
function TerminalOverview({
  view,
  lod,
  selected,
  short,
}: {
  view: Extract<NodeView, { kind: "source" | "sink" }>;
  lod: Exclude<LodTier, "full">;
  selected: boolean;
  short: boolean;
}) {
  const handles = view.ports.map((port) => <PortHandle key={port.handle} port={port} />);
  if (lod === "chip") {
    const ring = selected
      ? "ring-8 ring-accent"
      : short
        ? "ring-4 ring-flow-over-capacity"
        : "ring-4 ring-(--item-line)";
    return (
      <div
        style={tint(view.item.id)}
        className={`item-tint relative grid size-full place-items-center rounded-full bg-(--item-bg) ring-inset ${ring}`}
      >
        <span className="text-3xl font-bold text-(--item-fg)">{monogram(view.item.name)}</span>
        {handles}
      </div>
    );
  }
  return (
    <div
      className={`relative flex size-full items-center gap-4 rounded-full bg-surface-2 px-5 shadow-panel ring-inset ${cardRing(selected, short)}`}
    >
      <ItemChip item={view.item} size="xl" />
      <span className="truncate text-2xl font-semibold tracking-tight text-fg">{view.item.name}</span>
      {handles}
    </div>
  );
}
