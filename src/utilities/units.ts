// Rate units. Documents and the solver count items per second; packs state rates in their own unit,
// and the UI shows the unit the user picked (docs/Architecture/Documents.md, Units).
import type { RateUnit } from "../contracts/pack";
import { formatNumber } from "./numbers";

const SECONDS: Record<RateUnit, number> = { per_second: 1, per_minute: 60, per_hour: 3600 };
const SUFFIX: Record<RateUnit, string> = { per_second: "/s", per_minute: "/min", per_hour: "/h" };

/** A rate in `unit` as items per second. */
export function toPerSecond(rate: number, unit: RateUnit): number {
  return rate / SECONDS[unit];
}

/** Items per second as a rate in `unit`. */
export function fromPerSecond(perSecond: number, unit: RateUnit): number {
  return perSecond * SECONDS[unit];
}

/** `/min` */
export function rateSuffix(unit: RateUnit): string {
  return SUFFIX[unit];
}

/** `12.5/min` */
export function formatRate(perSecond: number, unit: RateUnit): string {
  return `${formatNumber(fromPerSecond(perSecond, unit))}${SUFFIX[unit]}`;
}
