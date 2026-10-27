// A recipe node: machines running one recipe. Header, machine groups, then one row per port: inputs on
// the left edge, outputs on the right.
import { memo } from "react";
import { formatMachines } from "../model/format";
import { MACHINE_STRIP, PORT_PADDING, PORT_ROW, RECIPE_HEADER } from "../model/geometry";
import { monogram } from "../model/item-chip";
import type { NodeSlot } from "../model/result-slots";
import type { PortView } from "../model/scene";
import { EfficiencyRing, ItemChip, Rate, ShortIcon } from "../parts";
import { useLod, useMachineGroups, useNodeSlot, useRateUnit } from "./context";
import { PortHandle } from "./port-handle";
import type { FlowNodeProps } from "./types";

export const RecipeNode = memo(function RecipeNode({ id, data: { view }, selected }: FlowNodeProps<"recipe">) {
  const slot = useNodeSlot(id);
  const lod = useLod();
  const groups = useMachineGroups();
  const machines = slot ? formatMachines(slot.result.activity, groups) : undefined;
  const short = Object.keys(slot?.deficits ?? {}).length > 0;
  const firstOutput = view.ports.find((port) => port.direction === "out");
  const handles = view.ports.map((port) => <PortHandle key={port.handle} port={port} />);

  if (lod === "chip") {
    return (
      <div
        className={`relative grid size-full place-items-center rounded-lg ring-inset ${short ? "bg-flow-over-capacity/25" : "bg-surface-4"} ${selected ? "ring-8 ring-accent" : short ? "ring-4 ring-flow-over-capacity" : "ring-2 ring-line-strong"}`}
      >
        <span className="text-3xl font-bold text-accent-fg">{monogram(view.title)}</span>
        {handles}
      </div>
    );
  }

  if (lod === "compact") {
    return (
      <div
        className={`relative flex size-full items-center gap-5 rounded-lg bg-surface-2 px-6 shadow-panel ${cardRing(selected, short)}`}
      >
        <span
          aria-hidden
          className="grid size-18 shrink-0 place-items-center rounded-lg bg-accent-soft text-2xl font-semibold text-accent-fg"
        >
          {monogram(view.building.name)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-2xl font-semibold tracking-tight text-fg">{view.title}</span>
          <span className="font-mono text-xl text-fg-muted">{machines ? `× ${machines.count}` : "—"}</span>
        </div>
        {handles}
      </div>
    );
  }

  return (
    <div
      className={`relative flex size-full flex-col rounded-lg bg-surface-2 shadow-panel ${cardRing(selected, short)}`}
    >
      <header style={{ height: RECIPE_HEADER }} className="flex shrink-0 items-center gap-3 px-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-sm font-semibold text-accent-fg ring-1 ring-accent-soft ring-inset"
        >
          {monogram(view.building.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-base font-semibold tracking-tight text-fg">{view.title}</span>
            {view.alternate && (
              <span className="shrink-0 rounded-xs bg-surface-4 px-1 text-2xs font-medium text-fg-muted">Alt</span>
            )}
          </div>
          <span className="truncate text-xs text-fg-subtle">{view.building.name}</span>
        </div>
        <EfficiencyRing efficiency={machines?.efficiency} label={machines ? machines.count : "—"} />
      </header>
      <div
        style={{ height: MACHINE_STRIP }}
        className="flex shrink-0 items-center gap-2 border-y border-line-subtle bg-surface-1 px-3 font-mono text-2xs text-fg-muted"
      >
        {machines ? machines.text : <span className="text-fg-faint">Not solved yet</span>}
      </div>
      <ul style={{ paddingBlock: PORT_PADDING }} className="flex flex-col px-3">
        {view.ports.map((port) => (
          <PortRow key={port.handle} port={port} slot={slot} divided={port === firstOutput && port !== view.ports[0]} />
        ))}
      </ul>
      {view.ports.map((port) => (
        <PortHandle key={port.handle} port={port} />
      ))}
    </div>
  );
});

export function cardRing(selected: boolean, short: boolean): string {
  if (selected) return "ring-2 ring-accent shadow-overlay";
  if (short) return "ring-1 ring-flow-over-capacity";
  return "ring-1 ring-line";
}

function PortRow({ port, slot, divided }: { port: PortView; slot: NodeSlot | undefined; divided: boolean }) {
  const unit = useRateUnit();
  const output = port.direction === "out";
  const rate = (output ? slot?.result.outputs : slot?.result.inputs)?.[port.item.id];
  const deficit = slot?.deficits[port.item.id];
  return (
    <li
      style={{ height: PORT_ROW }}
      className={`flex min-w-0 items-center gap-2 ${divided ? "border-t border-line-subtle" : ""}`}
      title={deficit ? `Short of ${port.item.name}` : undefined}
    >
      {!output && <ItemChip item={port.item} size="sm" />}
      <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{port.item.name}</span>
      {deficit !== undefined && <ShortIcon />}
      <Rate
        perSecond={rate}
        unit={unit}
        form={port.item.form}
        className={`text-xs ${deficit ? "text-flow-over-capacity" : "text-fg"}`}
      />
      {output && <ItemChip item={port.item} size="sm" />}
    </li>
  );
}
