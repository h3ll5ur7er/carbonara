// The inspector: the selected node and the settings its pack's plugin declares, as field descriptors.
// It knows nothing about documents; edits leave through `onFieldEdit` (see `applyFieldEdit` for the wiring).
import {
  ArrowDownRight,
  CircleAlert,
  Factory,
  Layers,
  MousePointerClick,
  SquareDashedMousePointer,
  TriangleAlert,
  Ungroup,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { RateUnit } from "../../../contracts/pack";
import type { FieldDescriptor, FieldValue } from "../../../contracts/plugin";
import type { ItemView } from "../../canvas/model/scene";
import { ItemChip, Rate } from "../../canvas/parts";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
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
  /** A subgraph instance: its blueprint, scale and ports. */
  instance?: InstanceDetails | undefined;
}

/** What the inspector shows of a subgraph instance (see `inspect.ts`). */
export interface InstanceDetails {
  blueprint: string;
  name: string;
  rateUnit: RateUnit;
  /** How many times the blueprint as designed it runs; undefined when it does what its ports need. */
  scale: number | undefined;
  /** Whether the graph around it was solved yet. */
  solved: boolean;
  /** Its blueprint's ports, inputs first, with what crosses them in items per second. */
  ports: { port: string; direction: "in" | "out"; item: ItemView; perSecond: number | undefined }[];
  /** The instances of the same blueprint in the graph on screen, this one included. */
  siblings: string[];
}

/** What can be done with a subgraph instance from the inspector. */
export interface InstanceActions {
  rename(name: string): unknown;
  open(): void;
  expand(): void;
  /** Selects every instance of its blueprint in the graph on screen. */
  selectSiblings(): void;
}

export interface InspectorProps {
  node: InspectedNode | null;
  /** Called once per committed edit; while a returned promise is pending, the control keeps the new value. */
  onFieldEdit(edit: FieldEdit): unknown;
  /** Sets the production value (machines, target, limit); null hands it back to the solver or removes it. */
  onProductionEdit?(value: number | null): unknown;
  /** For a subgraph instance: its buttons and its blueprint's name field do nothing without these. */
  instanceActions?: InstanceActions | undefined;
}

export function Inspector({ node, onFieldEdit, onProductionEdit, instanceActions }: InspectorProps) {
  if (!node) return <NothingSelected />;
  const fields = Object.entries(node.fields);
  const Icon = node.mixed || node.instance ? Layers : Factory;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg inset-ring inset-ring-accent/20">
          <Icon className="size-4.5" aria-hidden />
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
      {node.instance ? (
        <InstanceSection key={node.instance.blueprint} instance={node.instance} actions={instanceActions} />
      ) : (
        <Settings node={node} fields={fields} onFieldEdit={onFieldEdit} />
      )}
    </div>
  );
}

function Settings({
  node,
  fields,
  onFieldEdit,
}: {
  node: InspectedNode;
  fields: [string, FieldDescriptor][];
  onFieldEdit(edit: FieldEdit): unknown;
}) {
  return (
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
  );
}

/**
 * A subgraph instance: its blueprint's name (renaming it renames every copy), how far it runs, what crosses its
 * ports, and the ways into it: open it, expand it, or select all its copies on screen.
 */
function InstanceSection({ instance, actions }: { instance: InstanceDetails; actions: InstanceActions | undefined }) {
  const nameId = useId();
  const scaleId = useId();
  const copies = instance.siblings.length;
  return (
    <>
      <section aria-label="Blueprint" className="flex flex-col gap-3 border-t border-line-subtle px-4 pt-3.5 pb-4">
        <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Blueprint</h4>
        <Row label="Name" id={nameId}>
          <NameInput
            aria-labelledby={nameId}
            name={instance.name}
            disabled={!actions}
            onRename={(name) => actions?.rename(name)}
          />
        </Row>
        <Row label="Scale" id={scaleId}>
          <span className="text-sm text-fg">
            {!instance.solved ? (
              <span className="text-fg-faint">Not solved yet</span>
            ) : instance.scale !== undefined ? (
              <>
                <span className="font-mono tabular-nums">{formatNumber(instance.scale)}×</span>
                <span className="text-fg-subtle"> as designed</span>
              </>
            ) : (
              <span className="text-fg-subtle">Sized by its flows</span>
            )}
          </span>
        </Row>
      </section>
      <section aria-label="Ports" className="flex flex-col gap-1.5 border-t border-line-subtle px-4 pt-3.5 pb-4">
        <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Ports</h4>
        {instance.ports.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing goes in or out.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {instance.ports.map((port) => (
              <li key={port.port} className="flex min-h-7 items-center gap-2 text-sm">
                <ItemChip item={port.item} size="sm" />
                <span className="min-w-0 flex-1 truncate text-fg-muted">{port.item.name}</span>
                <span className="text-2xs text-fg-faint">{port.direction === "in" ? "In" : "Out"}</span>
                <Rate
                  perSecond={port.perSecond}
                  unit={instance.rateUnit}
                  form={port.item.form}
                  className="w-20 text-right text-xs text-fg"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <div role="group" aria-label="Subgraph" className="flex flex-wrap gap-2 border-t border-line-subtle px-4 py-3.5">
        <Button size="sm" variant="secondary" disabled={!actions} onClick={() => actions?.open()}>
          <ArrowDownRight /> Open
        </Button>
        <Button size="sm" variant="secondary" disabled={!actions} onClick={() => actions?.expand()}>
          <Ungroup /> Expand
        </Button>
        {copies > 1 && (
          <Button size="sm" variant="ghost" disabled={!actions} onClick={() => actions?.selectSiblings()}>
            <SquareDashedMousePointer /> Select all {copies}
          </Button>
        )}
      </div>
    </>
  );
}

/** A name edited in place: Enter or leaving the field renames, Escape puts the name back. */
function NameInput({
  name,
  disabled,
  onRename,
  ...props
}: {
  name: string;
  disabled: boolean;
  onRename(name: string): void;
  "aria-labelledby": string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== name) onRename(next);
  };
  return (
    <Input
      {...props}
      size="sm"
      className="w-44"
      value={draft ?? name}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape" && draft !== null) {
          // Escape takes the edit back without closing what the inspector sits in.
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
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
            className="rounded-sm text-accent-fg hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
