// Where items enter and leave the graph: sources (resources, imports) and sinks (goals, exports).
// Both are pills, so their silhouette alone sets them apart from machines.
import { memo } from "react";
import { formatNumber } from "../model/format";
import { ItemChip, Rate } from "../parts";
import { useNodeSlot, useRateUnit } from "./context";
import { PortHandle } from "./port-handle";
import { cardRing } from "./recipe-node";
import type { FlowNodeProps } from "./types";

export const SourceNode = memo(function SourceNode({ id, data: { view }, selected }: FlowNodeProps<"source">) {
  const slot = useNodeSlot(id);
  const unit = useRateUnit();
  const supplied = slot?.result.outputs[view.item.id] ?? slot?.result.activity;
  return (
    <div
      className={`relative flex size-full items-center gap-3 rounded-full bg-surface-2 pr-6 pl-4 shadow-panel ring-inset ${cardRing(selected, false)}`}
    >
      <ItemChip item={view.item} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-semibold tracking-tight text-fg">{view.item.name}</span>
          <Rate perSecond={supplied} unit={unit} className="text-xs text-fg" />
        </div>
        <span className="truncate text-2xs text-fg-subtle">
          Source
          {view.maxPerSecond !== undefined && (
            <>
              <span className="px-1 text-fg-faint">·</span>
              up to <Rate perSecond={view.maxPerSecond} unit={unit} className="text-fg-muted" />
            </>
          )}
        </span>
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
  const progress =
    view.targetPerSecond && delivered !== undefined ? Math.min(delivered / view.targetPerSecond, 1) : undefined;
  return (
    <div
      className={`relative flex size-full items-center gap-3 rounded-full bg-surface-2 pr-4 pl-6 shadow-panel ring-inset ${cardRing(selected, short)}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-semibold tracking-tight text-fg">{view.item.name}</span>
          <Rate perSecond={delivered} unit={unit} className="text-xs text-fg" />
        </div>
        {progress === undefined ? (
          <span className="text-2xs text-fg-subtle">Output</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-4">
              <span
                className={`block h-full rounded-full ${progress < 1 ? "bg-flow-near-capacity" : "bg-flow-healthy"}`}
                style={{ width: `${progress * 100}%` }}
              />
            </span>
            <span className="font-mono text-2xs text-fg-subtle">
              {formatNumber(progress * 100)}% of <Rate perSecond={view.targetPerSecond} unit={unit} />
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
