// The inspector: the selected node and the settings its pack's plugin declares, as field descriptors.
// It knows nothing about documents; edits leave through `onFieldEdit` (see `applyFieldEdit` for the wiring).
import { CircleAlert, Factory, Layers, MousePointerClick, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { FieldDescriptor, FieldValue } from "../../../contracts/plugin";
import { Button } from "../../ui/button";
import { NumberInput } from "../../ui/number-input";
import { formatNumber, nudgeIncrement } from "../../ui/number";
import { Select } from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/toggle";
import type { FieldEdit } from "./edit";
import type { Production } from "./inspect";
import { fieldControl } from "./fields";

export interface InspectedNode {
  title: string;
  subtitle?: string | undefined;
  /** A recipe's machine count, a sink's target or a source's limit; see `inspect.ts`. */
  production?: Production | undefined;
  fields: Record<string, FieldDescriptor>;
  values: Record<string, FieldValue>;
  /** Several nodes: the fields whose values differ among them. */
  mixed?: string[] | undefined;
  /** What the pack's plugin derived after the solve, formatted: "Power use", "13.4 MW". */
  metrics?: { label: string; value: string }[] | undefined;
  /** Warnings and errors about this node, from the compiler and the pack's plugin. */
  problems?: { kind: "error" | "warning"; message: string }[] | undefined;
}

export interface InspectorProps {
  node: InspectedNode | null;
  /** Called once per committed edit; while a returned promise is pending, the control keeps the new value. */
  onFieldEdit(edit: FieldEdit): unknown;
  /** Sets the production value (machines, target, limit); null hands it back to the solver or removes it. */
  onProductionEdit?(value: number | null): unknown;
}

export function Inspector({ node, onFieldEdit, onProductionEdit }: InspectorProps) {
  if (!node) return <NothingSelected />;
  const fields = Object.entries(node.fields);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg inset-ring inset-ring-accent/20">
          {node.mixed ? <Layers className="size-4.5" aria-hidden /> : <Factory className="size-4.5" aria-hidden />}
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-base font-semibold tracking-tight text-fg">{node.title}</h3>
          {node.subtitle && <p className="truncate text-xs text-fg-subtle">{node.subtitle}</p>}
        </div>
      </div>
      {node.problems && node.problems.length > 0 && <Problems problems={node.problems} />}
      {node.production && (
        <ProductionSection production={node.production} onEdit={(value) => onProductionEdit?.(value)} />
      )}
      {node.metrics && node.metrics.length > 0 && <Metrics metrics={node.metrics} />}
      <section aria-label="Settings" className="flex flex-col gap-4 border-t border-line-subtle px-4 pt-3.5 pb-5">
        <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Settings</h4>
        {fields.length === 0 && (
          <p className="text-sm text-fg-subtle">
            {node.mixed
              ? "They share no settings."
              : node.production?.kind === "machines"
                ? "This machine has no settings."
                : "Nothing else to set."}
          </p>
        )}
        {fields.map(([key, descriptor]) => (
          <Field
            key={key}
            descriptor={descriptor}
            value={node.values[key]}
            mixed={node.mixed?.includes(key) ?? false}
            onEdit={(value) => onFieldEdit({ key, descriptor, value })}
          />
        ))}
      </section>
    </div>
  );
}

/** One field descriptor as a control; the Save profile uses it for the plugin's document settings too. */
export function Field({
  descriptor,
  value,
  onEdit,
  mixed = false,
}: {
  descriptor: FieldDescriptor;
  value: FieldValue | undefined;
  onEdit(value: FieldValue): unknown;
  /** Several nodes whose values differ: the control shows the default, marked "Mixed", until one is set. */
  mixed?: boolean;
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
          <Row label={descriptor.label} id={id} mixed={mixed}>
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
        <Row label={descriptor.label} id={id} mixed={mixed}>
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
        <Row label={descriptor.label} id={id} mixed={mixed}>
          <Switch aria-labelledby={id} checked={control.value} onCheckedChange={(next) => void commit(next)} />
        </Row>
      );
  }
}

function Problems({ problems }: { problems: NonNullable<InspectedNode["problems"]> }) {
  return (
    <ul aria-label="Problems" className="flex flex-col gap-1.5 px-4 pb-3.5">
      {problems.map((problem, index) => {
        const Icon = problem.kind === "error" ? CircleAlert : TriangleAlert;
        return (
          <li key={index} className="flex items-start gap-2 text-xs text-fg-muted">
            <Icon
              className={`mt-px size-3.5 shrink-0 ${problem.kind === "error" ? "text-danger" : "text-flow-near-capacity"}`}
              aria-label={problem.kind === "error" ? "Error" : "Warning"}
            />
            <span>{problem.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** What the pack's plugin derived after the solve, such as power. */
function Metrics({ metrics }: { metrics: NonNullable<InspectedNode["metrics"]> }) {
  return (
    <section aria-label="Metrics" className="flex flex-col gap-1.5 border-t border-line-subtle px-4 pt-3.5 pb-4">
      <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Metrics</h4>
      <dl className="flex flex-col gap-1">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex min-h-6 items-center justify-between gap-3 text-sm">
            <dt className="truncate text-fg-muted">{metric.label}</dt>
            <dd className="font-mono text-fg tabular-nums">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** What an empty production value means, by kind. */
const UNSET: Record<Production["kind"], { text: string; action: string }> = {
  machines: { text: "Chosen by the solver", action: "Let the solver choose" },
  target: { text: "No target", action: "Remove target" },
  limit: { text: "Unlimited", action: "Remove limit" },
};

function ProductionSection({ production, onEdit }: { production: Production; onEdit(value: number | null): unknown }) {
  const id = useId();
  const [pending, setPending] = useState<number | null | undefined>(undefined);
  const value = pending === undefined ? production.value : pending;
  const shown = value ?? production.actual ?? 0;
  // Open-ended: arrows move by one machine, or by the power of ten below the rate.
  const nudge = production.kind === "machines" ? 1 : 10 ** Math.max(0, Math.floor(Math.log10(Math.max(shown, 1))));

  async function commit(next: number | null) {
    setPending(next);
    try {
      await onEdit(next);
    } finally {
      setPending(undefined);
    }
  }

  return (
    <section aria-label="Production" className="flex flex-col gap-2 border-t border-line-subtle px-4 pt-3.5 pb-4">
      <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Production</h4>
      <Row label={production.label} id={id}>
        <NumberInput
          aria-labelledby={id}
          size="sm"
          className="w-32"
          value={shown}
          min={0}
          max={1e9}
          nudge={nudge}
          unit={production.unit || undefined}
          onValueChange={(next) => void commit(next)}
        />
      </Row>
      <div className="flex min-h-6 items-center justify-between gap-3 text-xs">
        <span className="text-fg-subtle">
          {value === null
            ? UNSET[production.kind].text
            : production.actual !== undefined && Math.abs(production.actual - value) > 1e-6
              ? `Solver reached ${formatNumber(production.actual)}${production.unit}`
              : "Set by you"}
        </span>
        {value !== null && (
          <button
            type="button"
            onClick={() => void commit(null)}
            className="rounded-sm text-accent-fg hover:underline focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none"
          >
            {UNSET[production.kind].action}
          </button>
        )}
      </div>
      {production.fits && (
        <div role="group" aria-label="Balance" className="flex gap-2">
          <FitButton label="Fit to demand" machines={production.fits.demand} onFit={(count) => void commit(count)} />
          <FitButton label="Fit to supply" machines={production.fits.supply} onFit={(count) => void commit(count)} />
        </div>
      )}
    </section>
  );
}

/** Pins the machine count that fits the neighbours; disabled when nothing sets one. */
function FitButton({
  label,
  machines,
  onFit,
}: {
  label: string;
  machines: number | undefined;
  onFit(count: number): void;
}) {
  const count = machines === undefined ? undefined : Number(machines.toFixed(4));
  return (
    <Button
      size="sm"
      variant="secondary"
      className="flex-1 justify-between"
      disabled={count === undefined}
      onClick={() => count !== undefined && onFit(count)}
    >
      <span>{label}</span>
      <span className="font-mono text-fg-subtle tabular-nums">{count === undefined ? "—" : formatNumber(count)}</span>
    </Button>
  );
}

function Row({
  label,
  id,
  mixed = false,
  children,
}: {
  label: string;
  id: string;
  mixed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span id={id} className="truncate text-sm text-fg-muted">
          {label}
        </span>
        {mixed && (
          <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 py-px text-2xs font-medium text-fg-subtle">
            Mixed
          </span>
        )}
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
