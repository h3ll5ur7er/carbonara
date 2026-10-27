// Subgraphs on the canvas: an instance is a card like a machine's that reads as a stack (there is a whole
// graph behind it), with one row per port of its blueprint and a button to open it; inside a blueprint, its
// ports are pills with a dashed accent edge: the boundary where items come in and go out.
import { ArrowDownRight, Layers, LogIn, LogOut } from "lucide-react";
import { memo } from "react";
import { formatNumber } from "../model/format";
import { MACHINE_STRIP, PORT_PADDING, RECIPE_HEADER } from "../model/geometry";
import { monogram } from "../model/item-chip";
import { ItemChip, Rate } from "../parts";
import { useLod, useNodeSlot, useOpenSubgraph, useRateUnit } from "./context";
import { PortHandle } from "./port-handle";
import { cardRing, PortRow } from "./recipe-node";
import type { FlowNodeProps } from "./types";

export const InstanceNode = memo(function InstanceNode({ id, data: { view }, selected }: FlowNodeProps<"instance">) {
  const slot = useNodeSlot(id);
  const lod = useLod();
  const open = useOpenSubgraph();
  // Blueprints without pins have no design scale: their instances do what their ports need (activity 0).
  const scale = slot && slot.result.activity > 0 ? formatNumber(slot.result.activity) : undefined;
  const short = Object.keys(slot?.deficits ?? {}).length > 0;
  const firstOutput = view.ports.find((port) => port.direction === "out");
  const handles = view.ports.map((port) => <PortHandle key={port.handle} port={port} />);

  if (lod === "chip") {
    return (
      <div className="relative size-full">
        <Stack lod={lod} />
        <div
          className={`relative grid size-full place-items-center rounded-lg ring-inset ${short ? "bg-flow-over-capacity/25" : "bg-surface-4"} ${selected ? "ring-8 ring-accent" : short ? "ring-4 ring-flow-over-capacity" : "ring-2 ring-accent"}`}
        >
          <span className="text-3xl font-bold text-accent-fg">{monogram(view.title)}</span>
        </div>
        {handles}
      </div>
    );
  }

  if (lod === "compact") {
    return (
      <div className="relative size-full">
        <Stack lod={lod} />
        <div
          className={`relative flex size-full items-center gap-5 rounded-lg bg-surface-2 px-6 shadow-panel ${cardRing(selected, short)}`}
        >
          <span
            aria-hidden
            className="grid size-18 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg"
          >
            <Layers className="size-9" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-2xl font-semibold tracking-tight text-fg">{view.title}</span>
            <span className="font-mono text-xl text-fg-muted">{scale ? `× ${scale}` : "Subgraph"}</span>
          </div>
        </div>
        {handles}
      </div>
    );
  }

  return (
    <div className="relative size-full">
      <Stack lod={lod} />
      <div
        className={`relative flex size-full flex-col rounded-lg bg-surface-2 shadow-panel ${cardRing(selected, short)}`}
      >
        <header style={{ height: RECIPE_HEADER }} className="flex shrink-0 items-center gap-3 px-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-fg ring-1 ring-accent-soft ring-inset"
          >
            <Layers className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-semibold tracking-tight text-fg">{view.title}</span>
            <span className="truncate text-xs text-fg-subtle">Subgraph</span>
          </div>
          {scale && (
            <span className="shrink-0 rounded-md bg-surface-3 px-2 py-1 font-mono text-xs font-medium text-fg">
              × {scale}
            </span>
          )}
        </header>
        <div
          style={{ height: MACHINE_STRIP }}
          className="flex shrink-0 items-center gap-2 border-y border-line-subtle bg-surface-1 px-3 text-2xs text-fg-muted"
        >
          <span className="min-w-0 flex-1 truncate">
            {!slot ? (
              <span className="text-fg-faint">Not solved yet</span>
            ) : scale ? (
              <>
                Runs <span className="font-mono text-fg">{scale}×</span> as designed
              </>
            ) : (
              "Sized by its flows"
            )}
          </span>
          <button
            type="button"
            onClick={() => open(id)}
            title="Open subgraph"
            className="nodrag nopan flex h-5 items-center gap-1 rounded-xs bg-accent-soft pr-1.5 pl-2 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-glow focus-visible:outline-2 focus-visible:outline-accent"
          >
            Open
            <ArrowDownRight className="size-3.5" aria-hidden />
          </button>
        </div>
        <ul style={{ paddingBlock: PORT_PADDING }} className="flex flex-col px-3">
          {view.ports.map((port) => (
            <PortRow
              key={port.handle}
              port={port}
              slot={slot}
              divided={port === firstOutput && port !== view.ports[0]}
            />
          ))}
        </ul>
      </div>
      {handles}
    </div>
  );
});

/** The edge of a second card behind the instance: there's more inside. */
function Stack({ lod }: { lod: "full" | "compact" | "chip" }) {
  const offset = lod === "full" ? "translate-1.5" : "translate-3";
  return (
    <span aria-hidden className={`absolute inset-0 rounded-lg bg-surface-3 ring-1 ring-line ring-inset ${offset}`} />
  );
}

export const PortNode = memo(function PortNode({ id, data: { view }, selected }: FlowNodeProps<"port">) {
  const slot = useNodeSlot(id);
  const unit = useRateUnit();
  const lod = useLod();
  const input = view.direction === "in";
  const rate = slot && (input ? slot.result.outputs[view.item.id] : slot.result.inputs[view.item.id]);
  const Icon = input ? LogIn : LogOut;
  const ring = selected ? "border-accent shadow-overlay ring-2 ring-accent/30" : "border-accent";
  const handles = view.ports.map((port) => <PortHandle key={port.handle} port={port} />);

  if (lod === "chip") {
    return (
      <div
        className={`relative grid size-full place-items-center rounded-full border-4 border-dashed bg-accent-soft ${ring}`}
      >
        <span className="text-3xl font-bold text-accent-fg">{monogram(view.item.name)}</span>
        {handles}
      </div>
    );
  }

  const chip = <ItemChip item={view.item} size={lod === "full" ? "lg" : "xl"} />;
  return (
    <div
      className={`relative flex size-full items-center gap-3 rounded-full border-2 border-dashed bg-surface-2 shadow-panel ${ring} ${input ? "pr-6 pl-4" : "pr-4 pl-6"}`}
    >
      {input && chip}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {lod === "full" ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-base font-semibold tracking-tight text-fg">{view.item.name}</span>
              <Rate perSecond={rate} unit={unit} form={view.item.form} className="text-xs text-fg" />
            </div>
            <span className="flex items-center gap-1 text-2xs font-medium text-accent-fg">
              <Icon className="size-3" aria-hidden />
              {input ? "Input" : "Output"}
            </span>
          </>
        ) : (
          <span className="truncate text-2xl font-semibold tracking-tight text-fg">{view.item.name}</span>
        )}
      </div>
      {!input && chip}
      {handles}
    </div>
  );
});
