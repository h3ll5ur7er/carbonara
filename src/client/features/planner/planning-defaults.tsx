// The planner's defaults saved with the document (`settings.planning`): which building each family's recipes run in,
// and what raw resources weigh. Edited in the planner card and in the Save profile, each change one undoable
// `setSettings` edit; plans, the planner's and an MCP client's alike, start from them.
import { ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { PlanningSettings } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import { own } from "../../../utilities/records";
import { ItemChip } from "../../canvas/parts";
import { useConnector } from "../../core/connector";
import { errorMessage, toast } from "../../shell/toasts";
import { cx } from "../../ui/cx";
import { NumberInput } from "../../ui/number-input";
import { Select } from "../../ui/select";
import { buildingEdit, buildingFamilies, weightEdit, type PlanningEdit } from "./plan";

export interface PlanningDefaultsProps {
  pack: PackData;
  /** The document's `settings.planning`. */
  saved: PlanningSettings | undefined;
  onEdit(edit: PlanningEdit): void;
}

/** Saves a change to the document's planning defaults as one undo step. */
export function useSavePlanning(documentId: string): (edit: PlanningEdit) => void {
  const connector = useConnector();
  return (edit) => {
    const failed = (description: string) =>
      toast({ tone: "error", title: "Couldn't change the planner's defaults", ...(description && { description }) });
    connector.editing
      .apply({
        documentId,
        commands: [{ type: "setSettings", settings: { planning: edit.planning } }],
        label: edit.label,
      })
      .then((result) => {
        if (!result.ok) failed(result.error.map((issue) => issue.message).join(" "));
      })
      .catch((error: unknown) => failed(errorMessage(error)));
  };
}

/** Which building each family's recipes run in: one row per family with a choice. */
export function BuildingChoices({ pack, saved, onEdit }: PlanningDefaultsProps) {
  const families = useMemo(() => buildingFamilies(pack), [pack]);
  const preferred = saved?.buildings ?? [];
  return families.map((family) => {
    const chosen = family.members.find((member) => preferred.includes(member.id)) ?? family.base;
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
          onValueChange={(choice) => {
            if (choice !== chosen.id) onEdit(buildingEdit(saved, family, choice));
          }}
        />
      </div>
    );
  });
}

/**
 * How much one item per second of each raw resource weighs against the others, folded away until it's wanted:
 * most plans need none.
 */
export function ResourceWeights({ pack, saved, onEdit }: PlanningDefaultsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const weights = saved?.resourceWeights ?? {};
  const changed = Object.keys(weights).length;
  if (pack.resources.length === 0) return null;
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
            const weight = own(weights, id) ?? 1;
            return (
              <li key={id} className="flex items-center gap-2">
                <ItemChip item={item} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.name}</span>
                <NumberInput
                  aria-label={`Weight of ${item.name}`}
                  className="w-24 shrink-0"
                  value={weight}
                  min={0.01}
                  max={1000}
                  // Any hundredth: a step of 0.5 from 0.01 turned a typed 5 into 5.01.
                  step={0.01}
                  nudge={0.5}
                  onValueChange={(next) => {
                    if (next !== weight) onEdit(weightEdit(saved, pack, id, next));
                  }}
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
