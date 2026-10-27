// Rates as people say them ("2 full yellow belts", "1800 per minute") in items per second, the unit behind the
// managers. A belt or pipe means its full capacity, from the pack's logistics.
import type { RateConversion } from "../../contracts/managers";
import type { Logistics, PackData, RateUnit } from "../../contracts/pack";
import { fail, ok, type Result } from "../../contracts/result";
import { formatRate, fromPerSecond, toPerSecond } from "../../utilities/units";

const RATE_UNITS: Record<string, RateUnit> = {
  per_second: "per_second",
  "per second": "per_second",
  "/s": "per_second",
  per_minute: "per_minute",
  "per minute": "per_minute",
  "/min": "per_minute",
  per_hour: "per_hour",
  "per hour": "per_hour",
  "/h": "per_hour",
};

export function convertRate(
  pack: PackData,
  amount: number,
  unit: string,
  documentUnit: RateUnit,
): Result<RateConversion> {
  const answer = (perSecond: number, explanation: string): Result<RateConversion> =>
    ok({
      perSecond,
      inDocumentUnit: { rate: fromPerSecond(perSecond, documentUnit), unit: documentUnit },
      explanation,
    });

  const spoken = unit.trim().toLowerCase().replace(/\s+/g, " ");
  const rateUnit = RATE_UNITS[spoken];
  if (rateUnit) return answer(toPerSecond(amount, rateUnit), `${amount} ${rateUnit.replace("_", " ")}`);

  const logistics = findLogistics(pack, spoken);
  if (!logistics) {
    const known = pack.logistics.map(({ id, name, aliases }) =>
      aliases?.length ? `${name ?? id} (${aliases.join(", ")})` : (name ?? id),
    );
    return fail([
      {
        path: ["unit"],
        message:
          `Unknown unit "${unit}": use per_second, per_minute or per_hour, or one of the pack's belts and pipes: ` +
          `${known.join(", ") || "none"}.`,
      },
    ]);
  }
  const each = toPerSecond(logistics.capacity, pack.units.rate);
  return answer(
    amount * each,
    `${amount} × ${logistics.name ?? logistics.id} at ${formatRate(each, pack.units.rate)} each`,
  );
}

/** By id, name or alias, ignoring case, a leading "full" and a plural "s". */
function findLogistics(pack: PackData, spoken: string): Logistics | undefined {
  const bare = spoken.replace(/^full /, "");
  const wanted = new Set([bare, bare.replace(/s$/, "")]);
  return pack.logistics.find(({ id, name, aliases }) =>
    [id, name ?? "", ...(aliases ?? [])].some((word) => wanted.has(word.toLowerCase())),
  );
}
