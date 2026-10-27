# Factorio

Plan factories for [Factorio](https://factorio.com/) 2.1 by Wube Software, with the Space Age expansion: every item and fluid a machine or extractor deals with, every recipe a machine runs (recycling included) with every machine that can run it, belts from yellow to turbo, pipes, and the resources drills, pumps, agricultural towers and asteroid collectors extract. Rates are per second, as in the game.

The plugin models modules and beacons, built-in productivity (foundry, electromagnetic plant, biochamber), quality, fuel, power use and power generation:

- **Per node:** speed, productivity, efficiency and quality modules (and their tier), beacons in range with their speed and efficiency modules, how many machines share each beacon, the quality the node crafts at, the fuel a burner burns (an input of the node, coal by default), a reactor's neighbours, and the plasma temperature a fusion generator takes.
- **Save setting:** Space Age. Off, expansion recipes and buildings get a warning.
- **Metrics:** power use and beacon power in MW (drain included).
- **Power generation:** boilers, heat exchangers, steam engines and turbines, nuclear reactors and heating towers, fusion reactors and generators run recipes of their own. They make `electricity` and `heat`, items where 1 per second is 1 MW: a sink of electricity with a target sizes a power plant.

## Space Age and the other expansion mods

Content from the expansion is marked so a plugin can filter it:

- **Recipes** carry a tag for each expansion mod they need: `space-age`, `quality`, `recycler`, `elevated-rails`. A recipe needs a mod when its icon or one of its items comes from that mod, or when only that mod's machines can run it. Base game recipes stay untagged even when a Space Age machine can also run them.
- **Buildings** from an expansion mod have `fields.mod.name` (`space-age`, `recycler`).
- Recycling recipes are also tagged `recycling`, and recipes that accept productivity bonuses `productivity`.

## Productivity and quality

- `ignored-by-productivity:<item>=<amount>` tags the part of a result productivity doesn't multiply (`ignored_by_productivity`, such as Kovarex's 40 U-235), per craft on average.
- `no-quality` tags recipes whose products can't get a better quality (`allow_quality: false`).
- Every solid item has a variant per quality above normal: `iron-plate@uncommon`, `@rare`, `@epic`, `@legendary`. Fluids have none. Recipes stay at normal quality; the plugin maps a node's items to the quality it crafts at.

## Building fields

Read by the mechanics plugin.

- `modules: { slots, effects }`: module slots and the effects the building accepts (comma-separated; a prototype without `allowed_effects` accepts all).
- `base-effect`: built-in effects, such as the foundry's and the electromagnetic plant's `productivity: 0.5`.
- `energy: { drain }`: what an electric building draws even when idle, in MW (1/30 of its usage for crafting machines; a fusion reactor's 10 MW).
- `energy: { source: burner, fuel, usage, effectivity }`: buildings that burn fuel: the fuel categories, MW burnt at full speed, and how much heat a MJ of fuel gives (2.5 in a heating tower; 1 when left out). `source: heat` and `void` take heat or nothing.
- `fuels: { <item>: <MJ> }`: the fuels a burner takes, the default first; `burnt: { <fuel>: <item> }`: what a fuel burns into (uranium fuel cells).
- `reactor: { neighbour-bonus, neighbours, boosts }`: the bonus per neighbour, at most how many, and whether it makes more `heat` or hotter plasma (`temperature`).
- `generator: { fluid }`: a fusion generator takes this fluid at any temperature.
- `mod: { name }`: see above.

`power.consume` is in MW of electricity at full speed, the drain included; burner buildings have none. Generators have `power.produce`, their most MW.

## Power generation

Generated recipes, one second long, tagged `power`:

- `boiler-steam` (water → `steam@165`) and `heat-exchanger-steam` (water + `heat` → `steam@500`).
- `nuclear-reactor-heat` and `heating-tower-heat` (→ `heat`), `fusion-reactor-plasma` (cold fluoroketone → `fusion-plasma@1000000`).
- `steam-engine-electricity@165`, `@500`, `steam-turbine-electricity@165`, `@500` and `fusion-generator-electricity` (→ `electricity`).

Fluids that generators burn for their heat come in a variant per temperature: `steam@165`, `steam@500`, `fusion-plasma@1000000` … `@9000000`. Recipes that take steam of any temperature come once per variant (`coal-liquefaction@165`, `steam-condensation@500`). Pack version 2.0.0 replaced `steam`, `coal-liquefaction` and `steam-condensation` with these.

## Updating to a new game version

`data/` and `icons/` are generated; don't edit them by hand. Regenerate them from the game's own data:

```bash
factorio --dump-data        # writes script-output/data-raw-dump.json to the user data folder
pnpm pack:import factorio <user data>/script-output/data-raw-dump.json \
  <Factorio>/data/{core,base,elevated-rails,quality,recycler,space-age}/locale/en/*.cfg \
  --icons <Factorio>/data/base/graphics/icons --icons <Factorio>/data/space-age/graphics/icons
pnpm pack:build packs/factorio
```

- The locale files are optional: without them, names are made from the ids (`iron-gear-wheel` → "Iron gear wheel"). Factorio 2.0's dump works too.
- Icons are matched by prototype name, then by the file name the dump gives as the icon. The game's icons are strips of mipmaps (64 px, then 32, 16 and 8), of which `pack:import` takes the 64 px square. Layered icons (barrels …) have no single file; FactorioLab's sheet has them composed.
- Without a game install, cut FactorioLab's icon sheet into one PNG per prototype and pass that folder:

  ```bash
  pnpm exec tsx packs/factorio/scripts/factoriolab-icons.ts <factoriolab>/public/data/2x1/data.json \
    <factoriolab>/public/data/2x1/icons.webp <folder>
  ```

- Pipe throughput isn't in the data; `PIPE_CAPACITY` in `plugin/importer.ts` holds it. Belt colours (the "yellow belt" aliases) are in `BELT_ALIASES` there.
- The test fixture (`plugin/importer.fixture.ts`) is an excerpt of the real dump and locale: a few dozen prototypes with only the keys the importer reads. Add prototypes and keys from a new dump when the importer starts reading them.
- Record every source and its terms in `CREDITS.md`.

## Not in the data yet

The importer reads the dump but leaves these out; extend it when a plugin needs them:

- Solar panels, accumulators and lightning collectors; heat pipes, and the temperature of heat.
- `maximum_productivity` of recipes: none sets it in 2.1.14, so all have the default +300 %. Modules, beacons and quality levels are prototypes the data doesn't hold; their numbers are in `plugin/effects.ts`, from the Lua prototypes (see `CREDITS.md`). Update them there with a new game version.
- Space Age conditions: recipe and building `surface_conditions` (which planet or space), spoilage and spoil results, plant seeds and growth times, the fluid uranium mining needs, and belt stacking.
- Quality of buildings, modules and beacons (their bonuses), and per-item quality limits (`affected_by_quality`, ingredient `quality_min` …), which no 2.1.14 recipe uses.
- Mining rates: resource `mining_time` and drill `mining_speed` are only kept as the drill's `speed`.
