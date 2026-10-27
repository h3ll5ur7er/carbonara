// Nodes that route or annotate rather than produce: junctions, sticky notes and group frames.
import { NodeResizer } from "@xyflow/react";
import { memo, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from "react";
import { GRID } from "../model/geometry";
import { ItemChip, Rate, tint } from "../parts";
import { useAnnotationEdits, useLod, useNodeSlot, useRateUnit } from "./context";
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

export const NoteNode = memo(function NoteNode({ id, data: { view }, selected }: FlowNodeProps<"note">) {
  const lod = useLod();
  const { editText } = useAnnotationEdits();
  const [editing, setEditing] = useState(false);
  return (
    <div
      onDoubleClick={() => setEditing(true)}
      className={`relative size-full overflow-hidden rounded-md bg-surface-2 p-3 shadow-panel ring-inset ${selected ? "ring-2 ring-accent" : "ring-1 ring-line"}`}
    >
      <Resizer id={id} visible={!!selected && !view.locked} minWidth={GRID * 4} minHeight={GRID * 2} />
      <span aria-hidden className="absolute inset-0 bg-accent-soft" />
      <span aria-hidden className="absolute top-0 left-0 h-full w-1 bg-accent" />
      {editing ? (
        <InPlaceText
          multiline
          label="Note text"
          initial={view.text}
          onDone={(text) => {
            setEditing(false);
            if (text !== undefined && text !== view.text) editText(id, text);
          }}
          className="relative size-full resize-none bg-transparent text-sm text-fg outline-none"
        />
      ) : (
        lod !== "chip" && (
          <p className={`relative whitespace-pre-wrap text-fg-muted ${lod === "full" ? "text-sm" : "text-xl"}`}>
            {view.text}
          </p>
        )
      )}
    </div>
  );
});

/** Resize handles on a selected note or frame; the new size is one edit when the drag ends. */
function Resizer({
  id,
  visible,
  minWidth,
  minHeight,
}: {
  id: string;
  visible: boolean;
  minWidth: number;
  minHeight: number;
}) {
  const { resize } = useAnnotationEdits();
  return (
    <NodeResizer
      isVisible={visible}
      minWidth={minWidth}
      minHeight={minHeight}
      lineClassName="resize-line"
      handleClassName="resize-handle"
      onResizeEnd={(_event, { x, y, width, height }) => resize(id, { x, y, width, height })}
    />
  );
}

/**
 * Text edited where it's shown: Enter (Ctrl+Enter in a note) or leaving the field keeps it, Escape drops it.
 * `onDone` gets the text, or undefined when the edit was dropped.
 */
function InPlaceText({
  initial,
  multiline,
  label,
  className,
  onDone,
}: {
  initial: string;
  multiline?: boolean;
  label: string;
  className: string;
  onDone(text: string | undefined): void;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (value: string | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  const props = {
    autoFocus: true,
    "aria-label": label,
    value: text,
    // Keys typed here are text, not canvas shortcuts; pointer presses don't start a drag.
    className: `nodrag nopan nowheel ${className}`,
    onFocus: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => event.currentTarget.select(),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(event.currentTarget.value),
    onBlur: () => finish(text),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      event.stopPropagation();
      if (event.key === "Escape") finish(undefined);
      else if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) finish(text);
    },
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

/** Frame labels grow as the cards shrink, so frames stay the landmarks of an overview. */
const FRAME_LABEL = {
  full: "top-2.5 left-4 text-2xs",
  compact: "top-4 left-6 text-xl",
  chip: "top-6 left-8 text-3xl",
} as const;

export const FrameNode = memo(function FrameNode({ id, data: { view }, selected }: FlowNodeProps<"frame">) {
  const lod = useLod();
  const { editText } = useAnnotationEdits();
  const [editing, setEditing] = useState(false);
  return (
    <div
      style={tint(view.tone ?? id)}
      className={`item-tint relative size-full rounded-xl border border-dashed bg-(--item-wash) ${selected ? "border-accent" : "border-line-strong"}`}
    >
      <Resizer id={id} visible={!!selected && !view.locked} minWidth={GRID * 6} minHeight={GRID * 4} />
      {editing ? (
        <InPlaceText
          label="Frame label"
          initial={view.label}
          onDone={(text) => {
            setEditing(false);
            if (text !== undefined && text !== view.label) editText(id, text);
          }}
          className={`absolute w-1/2 rounded-xs bg-surface-1 font-semibold tracking-wider text-fg uppercase outline-none ${FRAME_LABEL[lod]}`}
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          className={`absolute font-semibold tracking-wider text-(--item-fg) uppercase ${FRAME_LABEL[lod]}`}
        >
          {view.label}
        </span>
      )}
    </div>
  );
});
