# Factorio

Plan factories for [Factorio](https://factorio.com/) 2.1 by Wube Software, with the Space Age expansion: every item and fluid a machine or extractor deals with, every recipe a machine runs (recycling included) with every machine that can run it, belts from yellow to turbo, pipes, and the resources drills, pumps, agricultural towers and asteroid collectors extract. Rates are per second, as in the game.

Modules, beacons, quality, heat and fluid temperatures come with a later version of the plugin.

## Space Age and the other expansion mods

Content from the expansion is marked so a plugin can filter it:

- **Recipes** carry a tag for each expansion mod they need: `space-age`, `quality`, `recycler`, `elevated-rails`. A recipe needs a mod when its icon or one of its items comes from that mod, or when only that mod's machines can run it. Base game recipes stay untagged even when a Space Age machine can also run them.
- **Buildings** from an expansion mod have `fields.mod.name` (`space-age`, `recycler`).
- Recycling recipes are also tagged `recycling`, and recipes that accept productivity bonuses `productivity`.

## Building fields

Read by the mechanics plugin later (CARB-44); nothing interprets them yet.

- `modules: { slots, effects }`: module slots and the effects the building accepts (comma-separated).
- `base-effect`: built-in effects, such as the foundry's and the electromagnetic plant's `productivity: 0.5`.
- `energy: { source, fuel }`: buildings that burn fuel (`burner`, with fuel categories) instead of drawing electricity.
- `mod: { name }`: see above.

`power.consume` is in MW at full speed, the electric drain included.

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

- Fluid temperatures (`steam` is one item; recipe temperature limits are dropped), heat, and power generation: boilers, steam engines and turbines, reactors, solar panels, fusion. Steam has no recipe, so it's a raw input for now.
- Productivity details: `ignored_by_productivity` and `maximum_productivity` of results, and beacons and modules themselves.
- Space Age conditions: recipe and building `surface_conditions` (which planet or space), spoilage and spoil results, plant seeds and growth times, the fluid uranium mining needs, and belt stacking.
- Quality: quality levels and the recycling of quality items (recycling recipes are in, at normal quality).
- Mining rates: resource `mining_time` and drill `mining_speed` are only kept as the drill's `speed`.
