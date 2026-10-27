// Hides how rates and machine counts read on the canvas. A stand-in until the rational display and the
// buildable-group splitting of CARB-13 exist as utilities; the canvas then swaps these for them.
import type { Document } from "../../../contracts/document";
import type { ItemForm, PackData, RateUnit } from "../../../contracts/pack";

export type MachineGroups = NonNullable<Document["settings"]["machineGroups"]>;

const SECONDS_PER: Record<RateUnit, number> = { per_second: 1, per_minute: 60, per_hour: 3600 };
const SUFFIX: Record<RateUnit, string> = { per_second: "/s", per_minute: "/min", per_hour: "/h" };

/** Values this close to an integer are that integer: solver results carry float noise. */
const EPSILON = 1e-6;

export interface FormattedRate {
  value: string;
  unit: string;
}

/** A belt or pipe whose capacity is the unit for the items it carries ("2 × Fast Conveyor"). */
export interface BeltUnit {
  name: string;
  form: ItemForm;
  /** Its capacity in items per second. */
  perSecond: number;
}

/** How a document shows rates: in its rate unit, and items of the belt's form in belts when it chose one. */
export interface RateDisplay {
  unit: RateUnit;
  belt?: BeltUnit | undefined;
}

/** Items per second in the document's display unit, with about three significant figures. */
export function formatRate(perSecond: number, display: RateUnit | RateDisplay, form?: ItemForm): FormattedRate {
  const { unit, belt } = typeof display === "string" ? { unit: display, belt: undefined } : display;
  if (belt && form === belt.form) return { value: formatNumber(perSecond / belt.perSecond), unit: ` × ${belt.name}` };
  return { value: formatNumber(perSecond * SECONDS_PER[unit]), unit: SUFFIX[unit] };
}

/** The display a document's settings ask for, with the pack's belts. */
export function rateDisplayOf(settings: Document["settings"], pack: PackData): RateDisplay {
  const unit = settings.rateUnit ?? pack.units.rate;
  const logistics = pack.logistics.find((candidate) => candidate.id === settings.belt);
  if (!logistics) return { unit };
  // Packs state capacities in their own rate unit.
  const perSecond = logistics.capacity / SECONDS_PER[pack.units.rate];
  return { unit, belt: { name: logistics.name ?? logistics.id, form: logistics.carries, perSecond } };
}

export interface RateChoice {
  /** A rate unit (`per_minute`), or `belt:<logistics id>`. */
  value: string;
  label: string;
}

const RATE_UNITS: RateUnit[] = ["per_second", "per_minute", "per_hour"];

/** What a document's rates can be shown in: the rate units, then each belt and pipe of the pack. */
export function rateChoices(pack: PackData): RateChoice[] {
  return [
    ...RATE_UNITS.map((unit) => ({ value: unit, label: SUFFIX[unit] })),
    ...pack.logistics.map((logistics) => ({
      value: `belt:${logistics.id}`,
      label: `× ${logistics.name ?? logistics.id}`,
    })),
  ];
}

/** The choice a document's settings stand for. */
export function choiceOf(settings: Document["settings"], pack: PackData): string {
  return settings.belt ? `belt:${settings.belt}` : (settings.rateUnit ?? pack.units.rate);
}

/** The `setSettings` change a choice makes. A rate unit also drops the belt; a belt keeps the unit for the rest. */
export function settingsFor(choice: string): { rateUnit?: RateUnit; belt: string | null } {
  if (choice.startsWith("belt:")) return { belt: choice.slice("belt:".length) };
  const unit = RATE_UNITS.find((candidate) => candidate === choice) ?? "per_minute";
  return { rateUnit: unit, belt: null };
}

export interface FormattedMachines {
  /** "4 × 100% + 1 × 37.5%". */
  text: string;
  /** How busy the machines that have to be built are, 0–1: drives the efficiency ring. */
  efficiency: number;
  /** The plain count, for compact cards. */
  count: string;
}

/**
 * A machine count as groups you can build: full machines and one for the rest ("fill": 4 × 100% + 1 × 37.5%),
 * or every machine at the same clock ("even": 5 × 87.5%).
 */
export function formatMachines(count: number, groupsAs: MachineGroups = "fill"): FormattedMachines {
  const rounded = Math.round(count);
  const whole = Math.abs(count - rounded) < EPSILON ? rounded : Math.floor(count);
  const partial = Math.abs(count - rounded) < EPSILON ? 0 : count - whole;
  if (whole === 0 && partial === 0) return { text: "Idle", efficiency: 0, count: "0" };
  if (groupsAs === "even" && partial > 0) {
    const built = whole + 1;
    const share = count / built;
    return {
      text: `${built} × ${trimZeros((share * 100).toFixed(2))}%`,
      efficiency: share,
      count: formatNumber(count),
    };
  }

  const groups = [];
  if (whole > 0) groups.push(`${whole} × 100%`);
  if (partial > 0) groups.push(`1 × ${trimZeros((partial * 100).toFixed(2))}%`);
  const built = whole + (partial > 0 ? 1 : 0);
  return { text: groups.join(" + "), efficiency: (whole + partial) / built, count: formatNumber(count) };
}

/** About three significant figures, thousands separated, no trailing zeros. */
export function formatNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude < EPSILON) return "0";
  const decimals = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  const fixed = trimZeros(value.toFixed(decimals));
  const [integer = "0", fraction] = fixed.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function trimZeros(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}
