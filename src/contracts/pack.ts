// The shape of a game pack: `manifest.yaml` and the files in `data/` (docs/Architecture/Game-packs.md).
// Structure only; what makes a pack *valid* beyond its shape (references, duplicates) is the packs engine's job.
import { z } from "zod";

/** Ids of items, buildings, recipes …: lowercase, may carry a variant after `@` (`steam@500`, `gear@rare`). */
export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*(@[a-z0-9._-]+)?$/, "lowercase letters, digits, . _ - and an optional @variant");
export type Id = z.infer<typeof Id>;

const SemVer = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, "a semantic version such as 1.2.0");
/** A version range: `1`, `1.2`, `1.2.3`, optionally with `^` or `~`. */
const EngineRange = z.string().regex(/^[\^~]?\d+(\.\d+){0,2}$/, "a range such as ^1 or ~1.2");
const HexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour such as #f5a623");
const Path = z.string().min(1);
const Name = z.string().min(1);
const Aliases = z.array(z.string().min(1));
const Amounts = z.record(Id, z.number().positive());

export const PackManifest = z.object({
  id: Id,
  name: Name,
  version: SemVer,
  engine: EngineRange.describe("The pack format and plugin API versions the pack was written for."),
  game: z.object({ name: Name, version: z.string().optional() }).optional(),
  data: Path.default("data/").describe("Folder whose files are merged, in name order, into the pack data."),
  plugin: Path.describe("The plugin module. Every pack has one; the template's does nothing."),
  theme: z.object({ accent: HexColour.optional() }).optional(),
});
export type PackManifest = z.infer<typeof PackManifest>;

export const ItemForm = z.enum(["solid", "fluid"]);
export type ItemForm = z.infer<typeof ItemForm>;

export const Item = z.object({
  id: Id,
  name: Name,
  form: ItemForm,
  icon: Path.optional(),
  aliases: Aliases.optional(),
});
export type Item = z.infer<typeof Item>;

export const Building = z.object({
  id: Id,
  name: Name,
  icon: Path.optional(),
  aliases: Aliases.optional(),
  speed: z
    .number()
    .positive()
    .default(1)
    .describe("Crafting speed: a recipe taking `time` seconds takes `time / speed` in this building."),
  power: z
    .object({ consume: z.number().nonnegative().optional(), produce: z.number().nonnegative().optional() })
    .optional()
    .describe("Power in MW: what the building consumes or produces at 100%."),
  fields: z
    .record(z.string(), z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])))
    .optional()
    .describe("Settings the pack's plugin interprets, such as the clock range."),
});
export type Building = z.infer<typeof Building>;

export const Recipe = z.object({
  id: Id,
  name: Name.optional(),
  icon: Path.optional(),
  buildings: z.array(Id).min(1).describe("Buildings that can run the recipe; the first is the default."),
  time: z.number().positive().describe("Seconds per craft at speed 1."),
  in: Amounts.default({}),
  out: Amounts.describe("Amounts per craft; probabilistic outputs are written as expected values."),
  tags: z.array(z.string().min(1)).optional(),
});
export type Recipe = z.infer<typeof Recipe>;

export const Logistics = z.object({
  id: Id,
  name: Name.optional(),
  aliases: Aliases.optional(),
  carries: ItemForm,
  capacity: z.number().positive().describe("Throughput in the pack's rate unit."),
});
export type Logistics = z.infer<typeof Logistics>;

export const Resource = z.object({
  item: Id,
  limit: z.number().positive().optional().describe("The most the map yields, in the pack's rate unit."),
  extractors: z.array(Id).optional(),
});
export type Resource = z.infer<typeof Resource>;

export const RateUnit = z.enum(["per_second", "per_minute", "per_hour"]);
export type RateUnit = z.infer<typeof RateUnit>;

const sections = {
  units: z.object({ rate: RateUnit }),
  items: z.array(Item),
  buildings: z.array(Building),
  recipes: z.array(Recipe),
  logistics: z.array(Logistics),
  resources: z.array(Resource),
};

/** One file in `data/`: any subset of the sections. */
export const PackDataFile = z.object({
  units: sections.units.optional(),
  items: sections.items.optional(),
  buildings: sections.buildings.optional(),
  recipes: sections.recipes.optional(),
  logistics: sections.logistics.optional(),
  resources: sections.resources.optional(),
});
export type PackDataFile = z.infer<typeof PackDataFile>;

/** All of a pack's data, merged from its files. */
export const PackData = z.object({
  units: sections.units.default({ rate: "per_minute" }),
  items: sections.items.default([]),
  buildings: sections.buildings.default([]),
  recipes: sections.recipes.default([]),
  logistics: sections.logistics.default([]),
  resources: sections.resources.default([]),
});
export type PackData = z.infer<typeof PackData>;
