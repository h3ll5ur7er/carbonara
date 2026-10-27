// What the importer and the mechanics agree on about energy: the items electricity and heat flow as, and how a fluid
// that generators burn for its heat is told apart by temperature (`steam@500`). See docs/Architecture/Plugins.md.

/** Electricity as an item: 1 per second is 1 MW. Generators make it; consumers report their use as a metric. */
export const ELECTRICITY = "electricity";
/** Heat as an item, from reactors and heating towers to heat exchangers: 1 per second is 1 MW. */
export const HEAT = "heat";

/** The id of a fluid at a temperature: `steam@165`. */
export function atTemperature(fluid: string, temperature: number): string {
  return `${fluid}@${temperature}`;
}

/** The fluid and temperature of an id such as `steam@165`; undefined for other ids (`iron-plate@rare`). */
export function temperatureOf(id: string): { fluid: string; temperature: number } | undefined {
  const match = /^(.+)@(\d+)$/.exec(id);
  return match ? { fluid: match[1] as string, temperature: Number(match[2]) } : undefined;
}
