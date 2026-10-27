// The inspector: the selected node and the settings its pack's plugin declares, as field descriptors.
// It knows nothing about documents; edits leave through `onFieldEdit` (see `applyFieldEdit` for the wiring).
import { Factory, MousePointerClick } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { FieldDescriptor, FieldValue } from "../../../contracts/plugin";
import { NumberInput } from "../../ui/number-input";
import { formatNumber, nudgeIncrement } from "../../ui/number";
import { Select } from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/toggle";
import type { FieldEdit } from "./edit";
import { fieldControl } from "./fields";

export interface InspectedNode {
  title: string;
  subtitle?: string | undefined;
  fields: Record<string, FieldDescriptor>;
  values: Record<string, FieldValue>;
}

export interface InspectorProps {
  node: InspectedNode | null;
  /** Called once per committed edit; while a returned promise is pending, the control keeps the new value. */
  onFieldEdit(edit: FieldEdit): unknown;
}

export function Inspector({ node, onFieldEdit }: InspectorProps) {
  if (!node) return <NothingSelected />;
  const fields = Object.entries(node.fields);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg inset-ring inset-ring-accent/20">
          <Factory className="size-4.5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-base font-semibold tracking-tight text-fg">{node.title}</h3>
          {node.subtitle && <p className="truncate text-xs text-fg-subtle">{node.subtitle}</p>}
        </div>
      </div>
      <section aria-label="Settings" className="flex flex-col gap-4 border-t border-line-subtle px-4 pt-3.5 pb-5">
        <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Settings</h4>
        {fields.length === 0 && <p className="text-sm text-fg-subtle">This machine has no settings.</p>}
        {fields.map(([key, descriptor]) => (
          <Field
            key={key}
            descriptor={descriptor}
            value={node.values[key]}
            onEdit={(value) => onFieldEdit({ key, descriptor, value })}
          />
        ))}
      </section>
    </div>
  );
}

function Field({
  descriptor,
  value,
  onEdit,
}: {
  descriptor: FieldDescriptor;
  value: FieldValue | undefined;
  onEdit(value: FieldValue): unknown;
}) {
  const id = useId();
  // The value being dragged or just committed, until the edit has gone through.
  const [pending, setPending] = useState<FieldValue | null>(null);
  const control = fieldControl(descriptor, pending ?? value);

  async function commit(next: FieldValue) {
    setPending(next);
    try {
      await onEdit(next);
    } finally {
      setPending(null);
    }
  }

  switch (control.control) {
    case "range":
      return (
        <div className="flex flex-col gap-2">
          <Row label={descriptor.label} id={id}>
            <NumberInput
              aria-labelledby={id}
              size="sm"
              className="w-28"
              value={control.value}
              {...control.range}
              unit={control.unit}
              onValueChange={(next) => void commit(next)}
            />
          </Row>
          {/* The slider moves in nudge steps for rough values; the stepper takes exact ones. */}
          <Slider
            aria-labelledby={id}
            aria-valuetext={control.unit ? `${formatNumber(control.value)} ${control.unit}` : undefined}
            value={control.value}
            min={control.range.min}
            max={control.range.max}
            step={nudgeIncrement(control.range)}
            onValueChange={setPending}
            onValueCommit={(next) => void commit(next)}
          />
        </div>
      );
    case "select":
      return (
        <Row label={descriptor.label} id={id}>
          <Select
            aria-labelledby={id}
            size="sm"
            className="w-40"
            value={control.value}
            options={control.options}
            onValueChange={(next) => void commit(next)}
          />
        </Row>
      );
    case "switch":
      return (
        <Row label={descriptor.label} id={id}>
          <Switch aria-labelledby={id} checked={control.value} onCheckedChange={(next) => void commit(next)} />
        </Row>
      );
  }
}

function Row({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span id={id} className="truncate text-sm text-fg-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function NothingSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 pb-12 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-fg-subtle inset-ring inset-ring-line-subtle">
        <MousePointerClick className="size-4.5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-fg-muted">Nothing selected</p>
        <p className="text-xs text-fg-subtle">Select a machine on the canvas to see its settings here.</p>
      </div>
    </div>
  );
}
