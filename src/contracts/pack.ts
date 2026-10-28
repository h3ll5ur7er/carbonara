// The shape of a game pack: `manifest.yaml`, the files in `data/` and the starter factories in `starters/`
// (docs/Architecture/Game-packs.md). Structure only; what makes a pack *valid* beyond its shape (references,
// duplicates) is the packs engine's job.
import { z } from "zod";
import { Blueprint, DocumentSettings, Graph, Layout, LocalId } from "./document";
import { Id, RateUnit } from "./ids";

export { Id, RateUnit };

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
  category: Id.optional().describe("One of the pack's `categories`: the kind of product the recipe makes."),
  unlock: Id.optional().describe(
    "One of the pack's `unlocks`: what makes the recipe available in the game. None: it's there from the start.",
  ),
});
export type Recipe = z.infer<typeof Recipe>;

/**
 * A heading the recipe browser lists recipes under (pack format 1.2): a product category (`categories`) or what
 * unlocks them in the game (`unlocks`). The browser shows them in the order the pack lists them.
 */
export const RecipeGroup = z.object({
  id: Id,
  name: Name,
  section: Name.optional().describe(
    "A wider heading the group belongs to, such as 'Intermediate products' or 'Tier 2'; groups of a section follow one another.",
  ),
});
export type RecipeGroup = z.infer<typeof RecipeGroup>;

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

/**
 * A starter factory: a file in the pack's `starters/` folder, which a new document for the pack can start from
 * (the first run opens one with the tour). It's a document's graph, layout and settings, so a factory built in
 * Carbonara and saved as plain JSON works as one: the fields a starter doesn't take are ignored.
 */
export const StarterFile = z.object({
  name: Name.describe("The factory's name; new documents are named after it."),
  description: z.string().optional().describe("One sentence on what the factory shows."),
  graph: Graph,
  blueprints: z.record(LocalId, Blueprint).default({}),
  layout: Layout.default({}),
  settings: DocumentSettings.default({}),
});
export type StarterFile = z.infer<typeof StarterFile>;

/** A starter factory in the pack data; its id is its file name without the extension. */
export const Starter = StarterFile.extend({ id: Id });
export type Starter = z.infer<typeof Starter>;

const sections = {
  units: z.object({ rate: RateUnit }),
  items: z.array(Item),
  buildings: z.array(Building),
  recipes: z.array(Recipe),
  logistics: z.array(Logistics),
  resources: z.array(Resource),
  categories: z.array(RecipeGroup),
  unlocks: z.array(RecipeGroup),
};

/** One file in `data/`: any subset of the sections. */
export const PackDataFile = z.object({
  units: sections.units.optional(),
  items: sections.items.optional(),
  buildings: sections.buildings.optional(),
  recipes: sections.recipes.optional(),
  logistics: sections.logistics.optional(),
  resources: sections.resources.optional(),
  categories: sections.categories.optional(),
  unlocks: sections.unlocks.optional(),
});
export type PackDataFile = z.infer<typeof PackDataFile>;

/** All of a pack's data, merged from its files, with its starter factories. */
export const PackData = z.object({
  units: sections.units.default({ rate: "per_minute" }),
  items: sections.items.default([]),
  buildings: sections.buildings.default([]),
  recipes: sections.recipes.default([]),
  logistics: sections.logistics.default([]),
  resources: sections.resources.default([]),
  categories: sections.categories.default([]),
  unlocks: sections.unlocks.default([]),
  starters: z.array(Starter).default([]).describe("From `starters/`, in file name order."),
});
export type PackData = z.infer<typeof PackData>;
