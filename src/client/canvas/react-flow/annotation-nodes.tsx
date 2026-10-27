// Nodes that route or annotate rather than produce: junctions, sticky notes, group frames, and a
// placeholder for kinds the canvas does not draw yet.
import { memo } from "react";
import { ItemChip, Rate, tint } from "../parts";
import { useLod, useNodeSlot, useRateUnit } from "./context";
import { PortHandle } from "./port-handle";
import type { FlowNodeProps } from "./types";

export const JunctionNode = memo(function JunctionNode({ id, data: { view }, selected }: FlowNodeProps<"junction">) {
  const slot = useNodeSlot(id);
  const unit = useRateUnit();
  const throughput = slot && Object.values(slot.result.inputs).reduce((sum, rate) => sum + rate, 0);
  const full = useLod() === "full";
  return (
    <div className="relative size-full">
      <div
        className={`grid size-full place-items-center rounded-full bg-surface-2 shadow-panel ring-inset ${selected ? "ring-2 ring-accent" : "ring-1 ring-line"}`}
      >
        {view.item ? <ItemChip item={view.item} size="sm" /> : <span className="size-2 rounded-full bg-fg-faint" />}
      </div>
      {full && (
        <Rate
          perSecond={throughput}
          unit={unit}
          form={view.item?.form}
          className="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-2xs text-fg-subtle"
        />
      )}
      {view.ports.map((port) => (
        <PortHandle key={port.handle} port={port} />
      ))}
    </div>
  );
});

export const NoteNode = memo(function NoteNode({ data: { view }, selected }: FlowNodeProps<"note">) {
  const lod = useLod();
  return (
    <div
      className={`relative size-full overflow-hidden rounded-md bg-surface-2 p-3 shadow-panel ring-inset ${selected ? "ring-2 ring-accent" : "ring-1 ring-line"}`}
    >
      <span aria-hidden className="absolute inset-0 bg-accent-soft" />
      <span aria-hidden className="absolute top-0 left-0 h-full w-1 bg-accent" />
      {lod !== "chip" && (
        <p className={`relative whitespace-pre-wrap text-fg-muted ${lod === "full" ? "text-sm" : "text-xl"}`}>
          {view.text}
        </p>
      )}
    </div>
  );
});

/** Frame labels grow as the cards shrink, so frames stay the landmarks of an overview. */
const FRAME_LABEL = {
  full: "top-2.5 left-4 text-2xs",
  compact: "top-4 left-6 text-xl",
  chip: "top-6 left-8 text-3xl",
} as const;

export const FrameNode = memo(function FrameNode({ id, data: { view }, selected }: FlowNodeProps<"frame">) {
  const lod = useLod();
  return (
    <div
      style={tint(view.tone ?? id)}
      className={`item-tint relative size-full rounded-xl border border-dashed bg-(--item-wash) ${selected ? "border-accent" : "border-line-strong"}`}
    >
      <span className={`absolute font-semibold tracking-wider text-(--item-fg) uppercase ${FRAME_LABEL[lod]}`}>
        {view.label}
      </span>
    </div>
  );
});

export const PlaceholderNode = memo(function PlaceholderNode({ data: { view } }: FlowNodeProps<"placeholder">) {
  return (
    <div className="grid size-full place-items-center rounded-lg border border-dashed border-line-strong text-xs text-fg-subtle">
      {view.label}
    </div>
  );
});
