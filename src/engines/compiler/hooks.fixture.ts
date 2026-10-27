// Test support: a plugin for the template pack that uses every compile hook, so tests can see each one at work.
import type { Document, Node } from "../../contracts/document";
import { definePlugin, isAlternate, unlockedRecipes } from "../../contracts/plugin";
import { waterLoop } from "./template.fixture";

/**
 * Furnaces have a speed (50–200 %), a mode and a booster that doubles their output. Boosters are scarce: the
 * document's `boosters` setting caps how many boosted furnaces may run. Alternates need unlocking.
 */
export const fixturePlugin = definePlugin({
  id: "fixture",
  nodeFields: (building) =>
    building.id === "furnace"
      ? {
          speed: { kind: "number", label: "Speed", min: 50, max: 200, step: 1, unit: "%", default: 100 },
          mode: { kind: "choice", label: "Mode", options: ["steady", "eager"], default: "steady" },
          boosted: { kind: "toggle", label: "Booster", default: false },
        }
      : {},
  settingsFields: () => ({
    boosters: { kind: "number", label: "Boosters", min: 0, max: 100, step: 1, default: 0 },
  }),
  metrics: { power: { label: "Power", unit: "MW" } },
  recipeAvailable: (recipe, { settings }) =>
    !isAlternate(recipe) || (unlockedRecipes(settings) ?? []).includes(recipe.id),
  effectiveRecipe: ({ recipe, fields }) => {
    const boost = fields.boosted === true ? 2 : 1;
    const out = Object.fromEntries(Object.entries(recipe.out).map(([item, amount]) => [item, amount * boost]));
    return { time: recipe.time / (Number(fields.speed ?? 100) / 100), in: recipe.in, out };
  },
  constraints: (nodes, { settings }) => [
    {
      terms: nodes.filter((node) => node.fields.boosted === true).map((node) => ({ node: node.id, coefficient: 1 })),
      op: "atMost",
      rhs: Number(settings.boosters ?? 0),
    },
  ],
  validate: ({ fields }) =>
    fields.mode === "eager" && Number(fields.speed) < 100
      ? [{ kind: "warning", message: "Eager furnaces want at least 100 %" }]
      : [],
  derive: ({ building, fields, machines }) => ({
    power: (building.power?.consume ?? 0) * (Number(fields.speed ?? 100) / 100) * machines,
  }),
});

/** The water loop with the smelting furnace's node replaced. */
export function smeltingWith(smelt: Partial<Extract<Node, { kind: "recipe" }>>, settings = {}): Document {
  const document = waterLoop();
  document.graph.nodes.smelt = { kind: "recipe", recipe: "iron-plate", ...smelt };
  document.settings = { plugin: settings };
  return document;
}
