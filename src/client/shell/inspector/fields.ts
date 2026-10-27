// Hides how a plugin's field descriptors become inspector controls: which control, which value it shows,
// and how an edit is named in the undo history.
import type { FieldDescriptor, FieldValue } from "../../../contracts/plugin";
import type { SelectOption } from "../../ui/select";
import { fit, formatNumber, type NumberRange } from "../../ui/number";

export type FieldControl =
  | { control: "range"; value: number; range: NumberRange; unit?: string }
  | { control: "select"; value: string; options: SelectOption[] }
  | { control: "switch"; value: boolean };

/** The control for a field, showing the node's value, or the default when it's missing or no longer valid. */
export function fieldControl(descriptor: FieldDescriptor, value: FieldValue | undefined): FieldControl {
  switch (descriptor.kind) {
    case "number": {
      const { min, max, step, unit } = descriptor;
      const range: NumberRange = step === undefined ? { min, max } : { min, max, step };
      const shown = typeof value === "number" ? fit(value, range) : descriptor.default;
      return unit === undefined
        ? { control: "range", value: shown, range }
        : { control: "range", value: shown, range, unit };
    }
    case "choice":
      return {
        control: "select",
        value: typeof value === "string" && descriptor.options.includes(value) ? value : descriptor.default,
        options: descriptor.options.map((option) => ({ value: option, label: option })),
      };
    case "toggle":
      return { control: "switch", value: typeof value === "boolean" ? value : descriptor.default };
  }
}

/** How an edit of the field reads in the undo history. */
export function fieldEditLabel(descriptor: FieldDescriptor, value: FieldValue): string {
  switch (descriptor.kind) {
    case "number": {
      const shown = formatNumber(Number(value), descriptor.step);
      return `Set ${descriptor.label} to ${descriptor.unit ? `${shown} ${descriptor.unit}` : shown}`;
    }
    case "choice":
      return `Set ${descriptor.label} to ${String(value)}`;
    case "toggle":
      return `Turn ${value ? "on" : "off"} ${descriptor.label}`;
  }
}
