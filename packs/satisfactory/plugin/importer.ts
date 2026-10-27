// Turns the game's own data file (CommunityResources/Docs/en-US.json, called Docs.json before 1.1) into pack data.
// Hides the Docs format: Unreal class groups, numbers and object lists written as strings, fluids in litres.
// Maintainer tooling (`pnpm pack:import satisfactory`); the app never runs it.
import type { Building, Item, Logistics, PackDataFile, Recipe, Resource } from "../../../src/contracts/pack";

/** File names the importer reads: the 1.1 name first, then the name older versions used. */
export const ACCEPTS = ["en-US.json", "Docs.json"];

/**
 * The most each resource yields per minute on the whole map, with every node and well fully used. Docs.json has no
 * resource node data; these totals come from SatisfactoryTools (see CREDITS.md). Water is unlimited.
 */
const MAP_LIMITS: Record<string, number> = {
  Desc_OreIron_C: 92100,
  Desc_OreCopper_C: 36900,
  Desc_Stone_C: 69900,
  Desc_Coal_C: 42300,
  Desc_OreGold_C: 15000,
  Desc_LiquidOil_C: 12600,
  Desc_RawQuartz_C: 13500,
  Desc_Sulfur_C: 10800,
  Desc_OreBauxite_C: 12300,
  Desc_OreUranium_C: 2100,
  Desc_NitrogenGas_C: 12000,
  Desc_SAM_C: 10200,
};

/** Clock speed in percent: 1% to 100%, and up to 250% with three power shards. The mechanics plugin reads it. */
const CLOCK = { min: 1, max: 250, default: 100 };

/** Docs groups classes by their native (C++) class. */
const ITEM_CLASSES = [
  "FGItemDescriptor",
  "FGResourceDescriptor",
  "FGItemDescriptorBiomass",
  "FGItemDescriptorNuclearFuel",
  "FGItemDescriptorPowerBoosterFuel",
  "FGPowerShardDescriptor",
  "FGConsumableDescriptor",
  "FGEquipmentDescriptor",
  "FGAmmoTypeProjectile",
  "FGAmmoTypeSpreadshot",
  "FGAmmoTypeInstantHit",
];
const MACHINE_CLASSES = ["FGBuildableManufacturer", "FGBuildableManufacturerVariablePower"];
const EXTRACTOR_CLASSES = ["FGBuildableResourceExtractor", "FGBuildableWaterPump", "FGBuildableFrackingExtractor"];
const GENERATOR_CLASSES = ["FGBuildableGeneratorFuel", "FGBuildableGeneratorNuclear"];

/** Liquids and gases are counted in litres in Docs, and in cubic metres everywhere in the game's UI. */
const LITRES_PER_CUBIC_METRE = 1000;

type DocsClass = Record<string, unknown> & { ClassName: string };
interface Fuel {
  mFuelClass: string;
  mSupplementalResourceClass: string;
  mByproduct: string;
  mByproductAmount: string;
}

export function importDocs(files: Record<string, Uint8Array>): {
  data: PackDataFile;
  icons: Record<string, Uint8Array>;
} {
  const name = ACCEPTS.find((accepted) => files[accepted]);
  if (!name) throw new Error(`Expected one of ${ACCEPTS.join(", ")}`);
  const groups = readDocs(files[name] as Uint8Array);
  const classes = (natives: string[]) => natives.flatMap((native) => groups.get(native) ?? []);
  const icons: Record<string, Uint8Array> = {};
  const iconFor = (id: string, source: string): { icon?: string } => {
    const bytes = files[`icons/${source}.webp`];
    if (!bytes) return {};
    icons[`icons/${id}.webp`] = bytes;
    return { icon: `icons/${id}.webp` };
  };

  const itemClasses = new Map(classes(ITEM_CLASSES).map((entry) => [entry.ClassName, entry]));
  const itemId = (className: string) => slug(text(itemClasses.get(className), "mDisplayName"));
  const isFluid = (className: string) => text(itemClasses.get(className), "mForm") !== "RF_SOLID";
  const amount = (className: string, litresOrPieces: number) =>
    isFluid(className) ? litresOrPieces / LITRES_PER_CUBIC_METRE : litresOrPieces;

  const buildingIds = new Map<string, string>();
  const building = (entry: DocsClass, power: Building["power"]): Building => {
    const name = text(entry, "mDisplayName");
    const id = slug(name);
    buildingIds.set(entry.ClassName, id);
    return { id, name, ...iconFor(id, name.replaceAll(" ", "_")), speed: 1, power, fields: { clock: CLOCK } };
  };
  const byName = (a: DocsClass, b: DocsClass) => text(a, "mDisplayName").localeCompare(text(b, "mDisplayName"));

  const machines = classes(MACHINE_CLASSES)
    .sort(byName)
    .map((entry) => {
      const speed = number(entry, "mManufacturingSpeed");
      // Variable-power machines (Particle Accelerator …) draw a recipe-dependent cycle; take the middle of its range.
      const consume =
        "mEstimatedMaximumPowerConsumption" in entry
          ? (number(entry, "mEstimatedMininumPowerConsumption") + number(entry, "mEstimatedMaximumPowerConsumption")) /
            2
          : number(entry, "mPowerConsumption");
      return { ...building(entry, { consume }), speed };
    });
  const extractorClasses = EXTRACTOR_CLASSES.flatMap((native) => [...(groups.get(native) ?? [])].sort(byName));
  const extractors = extractorClasses.map((entry) => building(entry, { consume: number(entry, "mPowerConsumption") }));
  const generatorClasses = classes(GENERATOR_CLASSES).sort(byName);
  const generators = generatorClasses.map((entry) => building(entry, { produce: number(entry, "mPowerProduction") }));

  const machineRecipes = (groups.get("FGRecipe") ?? []).flatMap((entry) => {
    const buildings = classNames(text(entry, "mProducedIn")).flatMap((producer) => {
      const id = buildingIds.get(producer);
      return id && machines.some((machine) => machine.id === id) ? [id] : [];
    });
    if (buildings.length === 0) return []; // made by hand, at a workbench or with the build gun
    const name = text(entry, "mDisplayName");
    const alternate = name.startsWith("Alternate: ");
    const recipe: Recipe = {
      id: alternate ? `alt-${slug(name.slice("Alternate: ".length))}` : slug(name),
      name,
      buildings,
      time: number(entry, "mManufactoringDuration"),
      in: amounts(text(entry, "mIngredients")),
      out: amounts(text(entry, "mProduct")),
      ...(alternate && { tags: ["alternate"] }),
    };
    return [recipe];
  });
  function amounts(list: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [, className, value] of list.matchAll(/\.(\w+)'",Amount=(\d+(?:\.\d+)?)/g)) {
      result[itemId(className as string)] = amount(className as string, Number(value));
    }
    return result;
  }
  // Two recipes of the same name (Turbo Rifle Ammo) get an id per building.
  const idCounts = countBy(machineRecipes.map((recipe) => recipe.id));
  for (const recipe of machineRecipes) {
    if ((idCounts.get(recipe.id) ?? 0) > 1) recipe.id = `${recipe.id}-${recipe.buildings[0]}`;
  }

  const fuelRecipes = generatorClasses.flatMap((generator) => {
    const generatorId = buildingIds.get(generator.ClassName) as string;
    const generatorName = text(generator, "mDisplayName");
    const powerMW = number(generator, "mPowerProduction");
    return (generator.mFuel as Fuel[]).flatMap((fuel): Recipe[] => {
      const fuelClass = itemClasses.get(fuel.mFuelClass);
      if (!fuelClass) return [];
      // One craft burns one piece or one cubic metre of fuel; energy is in MJ per piece or per litre.
      const energyMJ = number(fuelClass, "mEnergyValue") * (isFluid(fuel.mFuelClass) ? LITRES_PER_CUBIC_METRE : 1);
      const time = energyMJ / powerMW;
      const fuelId = itemId(fuel.mFuelClass);
      const inputs: Record<string, number> = { [fuelId]: 1 };
      if (fuel.mSupplementalResourceClass) {
        // Supplemental resource (water) in litres per second per MW produced.
        const litres = powerMW * number(generator, "mSupplementalToPowerRatio") * time;
        inputs[itemId(fuel.mSupplementalResourceClass)] = amount(fuel.mSupplementalResourceClass, litres);
      }
      const outputs: Record<string, number> = {};
      if (fuel.mByproduct) outputs[itemId(fuel.mByproduct)] = Number(fuel.mByproductAmount);
      return [
        {
          id: `${generatorId}-${fuelId}`,
          name: `${generatorName} (${text(fuelClass, "mDisplayName")})`,
          buildings: [generatorId],
          time,
          in: inputs,
          out: outputs,
          tags: ["power"],
        },
      ];
    });
  });

  const resources: Resource[] = (groups.get("FGResourceDescriptor") ?? []).map((entry) => {
    const form = text(entry, "mForm");
    const extractorIds = extractorClasses
      .filter((extractor) =>
        text(extractor, "mOnlyAllowCertainResources") === "True"
          ? classNames(text(extractor, "mAllowedResources")).includes(entry.ClassName)
          : text(extractor, "mAllowedResourceForms").includes(form),
      )
      .map((extractor) => buildingIds.get(extractor.ClassName) as string);
    const limit = MAP_LIMITS[entry.ClassName];
    return { item: itemId(entry.ClassName), ...(limit !== undefined && { limit }), extractors: extractorIds };
  });

  const recipes = [...machineRecipes, ...fuelRecipes].sort((a, b) => a.id.localeCompare(b.id));
  const used = new Set([
    ...recipes.flatMap((recipe) => [...Object.keys(recipe.in), ...Object.keys(recipe.out)]),
    ...resources.map((resource) => resource.item),
  ]);
  const items: Item[] = [...itemClasses.values()]
    .filter((entry) => used.has(itemId(entry.ClassName)))
    .map((entry): Item => {
      const id = itemId(entry.ClassName);
      const texture = text(entry, "mSmallIcon")
        .replace(/^.*\./, "")
        .replace(/_(64|128|256|512|1024)$/, "");
      return {
        id,
        name: text(entry, "mDisplayName"),
        form: isFluid(entry.ClassName) ? "fluid" : "solid",
        ...iconFor(id, texture),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const logistics: Logistics[] = [
    // Belt speed is in half items per minute (Mk.1: 120 → 60 items per minute); pipe flow in m³ per second.
    ...tiers(groups.get("FGBuildableConveyorBelt"), "belt", "solid", (entry) => number(entry, "mSpeed") / 2),
    // Clean pipelines are the same pipes without the flow indicator.
    ...tiers(
      groups.get("FGBuildablePipeline")?.filter((entry) => !entry.ClassName.endsWith("_NoIndicator_C")),
      "pipe",
      "fluid",
      (entry) => number(entry, "mFlowLimit") * 60,
    ),
  ];

  return {
    data: {
      units: { rate: "per_minute" },
      items,
      buildings: [...machines, ...extractors, ...generators],
      recipes,
      logistics,
      resources: resources.sort((a, b) => a.item.localeCompare(b.item)),
    },
    icons,
  };
}

/** Belts or pipes as logistics tiers, with aliases such as "mk1 belt". */
function tiers(
  entries: DocsClass[] | undefined,
  noun: string,
  carries: Logistics["carries"],
  capacity: (entry: DocsClass) => number,
): Logistics[] {
  return [...(entries ?? [])]
    .sort((a, b) => text(a, "mDisplayName").localeCompare(text(b, "mDisplayName")))
    .map((entry) => {
      const name = text(entry, "mDisplayName");
      const tier = /Mk\.(\d+)/.exec(name)?.[1];
      return {
        id: slug(name),
        name,
        ...(tier && { aliases: [`mk${tier} ${noun}`, `${noun} mk${tier}`] }),
        carries,
        capacity: capacity(entry),
      };
    });
}

/** Docs files are UTF-16 with a byte order mark in the game folder; copies are often re-saved as UTF-8. */
function readDocs(bytes: Uint8Array): Map<string, DocsClass[]> {
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
  const json = new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(bytes);
  const groups = new Map<string, DocsClass[]>();
  for (const group of JSON.parse(json) as { NativeClass: string; Classes: DocsClass[] }[]) {
    // "/Script/CoreUObject.Class'/Script/FactoryGame.FGRecipe'" → "FGRecipe"
    const native = /\.(\w+)'$/.exec(group.NativeClass)?.[1] ?? group.NativeClass;
    groups.set(native, [...(groups.get(native) ?? []), ...group.Classes]);
  }
  return groups;
}

/** Class names in a Docs object list: `("/Game/…/Build_SmelterMk1.Build_SmelterMk1_C", …)` → `Build_SmelterMk1_C`. */
function classNames(list: string): string[] {
  return [...list.matchAll(/\.(\w+_C)\b/g)].map((match) => match[1] as string);
}

function text(entry: Record<string, unknown> | undefined, key: string): string {
  const value = entry?.[key];
  if (typeof value !== "string") throw new Error(`${String(entry?.ClassName)} has no ${key}`);
  return value;
}

function number(entry: Record<string, unknown>, key: string): number {
  return Number(text(entry, key));
}

/** "Miner Mk.1" → "miner-mk1", "Coal-Powered Generator" → "coal-powered-generator". */
function slug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(".", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
