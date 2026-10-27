# Satisfactory

Plan factories for [Satisfactory](https://www.satisfactorygame.com/) 1.1 by Coffee Stain Studios: every item, every recipe a machine runs (alternates included), the fuels each generator burns, belts Mk.1 to Mk.6, pipelines Mk.1 and Mk.2, and the map's resource limits. Rates are per minute, as in the game.

Clock speed, power shards, somersloops and the power curve come with a later version of the plugin.

## Updating to a new game version

`data/` and `icons/` are generated; don't edit them by hand. Regenerate them from the game's own data file (UTF-16 is fine):

```bash
pnpm pack:import satisfactory "<Satisfactory>/CommunityResources/Docs/en-US.json" --icons <folder of icon images>
pnpm pack:build packs/satisfactory
```

- `--icons` may be given several times. Images are matched by the game's texture name (`IconDesc_IronIngot_256.png`) for items and by display name (`Miner_Mk.1.png`) for buildings; a size suffix (`_64`, `_256` …) is ignored and the largest image wins. The pack's icons are 64×64 WebP.
- The map's resource limits aren't in the game's data file; update `MAP_LIMITS` in `plugin/importer.ts` when the map changes.
- Record every source and its terms in `CREDITS.md`.
