// Records keyed by ids. Ids are the games' own names, and a game may call something `constructor` (Satisfactory
// does) or any other name a plain object inherits from Object.prototype; reading `record[id]` would then find the
// inherited member instead of nothing (CARB-83). These helpers only ever look at a record's own keys.

/** The record's own value for the key, or undefined: never what a plain object inherits. */
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Adds an amount to the record's own entry for the key, which starts at 0. */
export function addTo(record: Record<string, number>, key: string, amount: number): void {
  record[key] = (own(record, key) ?? 0) + amount;
}
