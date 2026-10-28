// What unlocks Satisfactory's recipes, for the recipe browser's groups. Hides the game's schematics: milestones by
// tier (with the background unlocks that come with them) and the HUB upgrades of tier 0, the MAM's research trees,
// hard drives (alternates), and the starting recipes, which need nothing.
import type { RecipeGroup } from "../../../src/contracts/pack";

type DocsClass = Record<string, unknown> & { ClassName: string };

const MAM = "MAM research";
const HARD_DRIVES: RecipeGroup = { id: "hard-drives", name: "Hard drives", section: MAM };
/** The recipes a new game starts with. */
const STARTING = "Schematic_StartingRecipes_C";
/** Research trees as the MAM names them, where their folder (`Research/AlienTech_RS`) doesn't spell it out. */
const TREE_NAMES: Record<string, string> = {
  AlienOrganisms: "Alien Organisms",
  AlienTech: "Alien Technology",
  PowerSlugs: "Power Slugs",
  XMas: "FICSMAS",
};

/** The MAM comes with Field Research, a milestone of tier 1: its research is open from then on. */
const MAM_TIER = 1;

/** Milestones first (by tier, then as the HUB lists them), then MAM research, then hard drives, then the rest. */
type Rank = [kind: number, tier: number, priority: number, name: string];
interface Unlock {
  group: RecipeGroup;
  /** How the browser lists it. */
  rank: Rank;
  /** The tier from which it's open: a recipe two schematics unlock counts as the earlier one's. */
  open: number;
}

export interface Unlocks {
  /** What unlocks the recipe of this class (`Recipe_IngotIron_C`), marked as used; none when it's there from the start. */
  of(recipeClass: string): string | undefined;
  /** The unlocks used, earliest first. */
  list(): RecipeGroup[];
}

export function schematicUnlocks(schematics: DocsClass[], slug: (name: string) => string): Unlocks {
  const byClass = new Map(schematics.map((schematic) => [schematic.ClassName, schematic]));

  /** What a schematic counts as; null for the starting recipes. */
  function unlockOf(schematic: DocsClass): Unlock | null {
    if (schematic.ClassName === STARTING) return null;
    // A milestone's background unlocks (`Schematic_8-1-1_C`) come with the milestone (`Schematic_8-1_C`).
    const background = /^Schematic_(\d+)-(\d+)-\d+_C$/.exec(schematic.ClassName);
    const milestone = background && byClass.get(`Schematic_${background[1] as string}-${background[2] as string}_C`);
    if (milestone) return unlockOf(milestone);
    const name = text(schematic.mDisplayName);
    const tier = Number(text(schematic.mTechTier) || 0);
    const priority = Number(text(schematic.mMenuPriority) || 0);
    if (schematic.mType === "EST_Milestone" || schematic.mType === "EST_Tutorial") {
      return { group: { id: slug(name), name, section: `Tier ${tier}` }, rank: [0, tier, priority, name], open: tier };
    }
    const fullName = text(schematic.FullName);
    const tree = /\/Schematics\/Research\/(\w+)_RS\//.exec(fullName)?.[1];
    if (tree) {
      const treeName = TREE_NAMES[tree] ?? tree.replace(/(?<=[a-z])(?=[A-Z])/g, " ");
      const group = { id: `mam-${slug(treeName)}`, name: treeName, section: MAM };
      return { group, rank: [1, 0, 0, treeName], open: MAM_TIER };
    }
    if (schematic.mType === "EST_Alternate" || fullName.includes("/Schematics/Alternate/")) {
      return { group: HARD_DRIVES, rank: [2, 0, 0, HARD_DRIVES.name], open: MAM_TIER };
    }
    return { group: { id: slug(name), name }, rank: [3, tier, priority, name], open: tier };
  }

  // Each recipe's earliest unlock; null when the game starts with it.
  const earliest = new Map<string, Unlock | null>();
  for (const schematic of schematics) {
    const unlock = unlockOf(schematic);
    for (const recipe of unlockedRecipes(schematic)) {
      const current = earliest.get(recipe);
      if (current === null) continue;
      if (unlock === null || current === undefined || sooner(unlock, current)) {
        earliest.set(recipe, unlock);
      }
    }
  }

  const used = new Map<string, Unlock>();
  return {
    of(recipeClass) {
      const unlock = earliest.get(recipeClass);
      if (!unlock) return undefined;
      const known = used.get(unlock.group.id);
      if (!known || compareRanks(unlock.rank, known.rank) < 0) used.set(unlock.group.id, unlock);
      return unlock.group.id;
    },
    list: () => [...used.values()].sort((a, b) => compareRanks(a.rank, b.rank)).map((unlock) => unlock.group),
  };
}

/** The recipe classes a schematic unlocks: `mRecipes` lists of its `BP_UnlockRecipe_C` unlocks. */
function unlockedRecipes(schematic: DocsClass): string[] {
  const unlocks = Array.isArray(schematic.mUnlocks) ? (schematic.mUnlocks as Record<string, unknown>[]) : [];
  return unlocks.flatMap((unlock) => [...text(unlock.mRecipes).matchAll(/\.(\w+_C)'/g)].map((m) => m[1] as string));
}

/** Open at an earlier tier, or at the same tier and listed first. */
function sooner(a: Unlock, b: Unlock): boolean {
  return a.open - b.open < 0 || (a.open === b.open && compareRanks(a.rank, b.rank) < 0);
}

function compareRanks(a: Rank, b: Rank): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3].localeCompare(b[3]);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
