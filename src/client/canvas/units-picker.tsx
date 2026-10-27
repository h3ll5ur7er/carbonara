// The document's display settings, in the canvas's bottom-right corner (the totals take the bottom-left): what rates are shown in (a rate unit or a
// belt) and how machine counts read. Each change is one undoable `setSettings` edit, through the edit actions.
import { Factory } from "lucide-react";
import type { Document } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import { Select } from "../ui/select";
import { Toggle } from "../ui/toggle";
import type { CanvasEditActions } from "./edit-actions";
import { choiceOf, rateChoices } from "./model/format";

export function UnitsPicker({
  settings,
  pack,
  right,
  actions,
}: {
  settings: Document["settings"];
  pack: PackData;
  /** Where the visible canvas ends, clear of the right panel. */
  right: number;
  actions: CanvasEditActions;
}) {
  return (
    <div
      style={{ right }}
      className="absolute bottom-3 mr-3 flex items-center gap-1 rounded-lg bg-glass p-1 shadow-panel backdrop-blur-glass"
    >
      <Select
        size="sm"
        aria-label="Show rates in"
        value={choiceOf(settings, pack)}
        options={rateChoices(pack)}
        onValueChange={(choice) => actions.showRatesIn(choice)}
      />
      <Toggle
        pressed={settings.machineGroups === "even"}
        onPressedChange={() => actions.toggleMachineGroups()}
        label="Round machines to buildable (5 × 87.5% instead of 4 × 100% + 1 × 37.5%)"
        icon={<Factory />}
      />
    </div>
  );
}
