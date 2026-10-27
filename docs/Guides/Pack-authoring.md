# Pack authoring

This guide builds a small game pack from scratch, *Brick Works*: clay and wood go into kilns and come out as bricks. You'll scaffold the pack, write its data, check it, try it in the app, add a starter factory and build the `.cpack` file people install. The plugin that gives kilns their mechanics is the next guide, [[Guides/Plugin authoring]].

The reference for everything here is [[Architecture/Game packs]]; the shapes are defined in [[src/contracts/pack.ts]].

[TOC]

## What you need

- A checkout of this repository with its dependencies installed (`pnpm install`, see [[Development]]). The pack command line, `carbonara-pack`, runs from it: `pnpm carbonara-pack <command>`.
- An editor that understands YAML. The JSON Schemas in `schemas/` describe every file (see [Editor help](#editor-help)).

Your pack can live anywhere. Inside the repository's `packs/` folder it also loads into the app while `pnpm dev` runs, which is the quickest way to try it; elsewhere you build it and install the `.cpack`.

## 1. Create the pack

```bash
pnpm carbonara-pack new brick-works --name "Brick Works"            # into packs/brick-works
pnpm carbonara-pack new brick-works --name "Brick Works" --into ~/packs   # or anywhere else
```

The id (`brick-works`) is lowercase letters, digits, `.`, `_` and `-`. It names the pack for good: documents remember the id of the pack they were planned with, and installing a pack with the same id replaces it.

`new` copies the template pack (`packs/_template`, *Template Works*) and gives you:

```
brick-works/
├─ manifest.yaml        # id, name, version 0.1.0, the pack format it needs, where data and plugin are
├─ data/                # the template's items, buildings, recipes and belts: replace them with yours
├─ plugin/index.ts      # a plugin that does nothing yet
├─ README.md            # shown in the pack manager: say which game and version the pack covers
└─ CREDITS.md           # where the data and icons come from, and whose permission covers them
```

The manifest:

```yaml
id: brick-works
name: Brick Works
version: 0.1.0
engine: ^1.1 # the pack format (and plugin API) this pack is written for
game: { name: Brick Works } # add `version: "1.4"` for the game version the data matches
data: data/
plugin: plugin/index.js # the bundled plugin; the build makes it from plugin/index.ts
theme: { accent: "#f5a623" } # the colour the app's accents take while your pack's factory is open
```

Pick an accent that suits the game; it should be warm and light enough to carry dark text (the app writes on it in a dark ink).

## 2. Write the data

Delete the template's files in `data/` and write your own. `data/` may hold any number of YAML or JSON files, which are merged in name order: lists are joined, and `units` may appear in one file only. Split them however you like; here, one file for items and one for what makes them.

`data/items.yaml`:

```yaml
units: { rate: per_minute } # how the game states rates: per_second, per_minute or per_hour

items:
  - { id: clay, name: Clay, form: solid }
  - { id: sand, name: Sand, form: solid }
  - { id: water, name: Water, form: fluid }
  - { id: wood, name: Wood, form: solid, aliases: [logs, firewood] }
  - { id: brick, name: Brick, form: solid, aliases: [bricks] }
  - { id: glass, name: Glass, form: solid }
```

`data/production.yaml`:

```yaml
buildings:
  - id: kiln
    name: Kiln
    fields: { temperature: { min: 800, max: 1200, default: 1000 } } # read by the plugin
  - { id: pug-mill, name: Pug Mill, power: { consume: 2 } }

recipes:
  - id: brick
    buildings: [kiln]
    time: 6
    in: { clay: 2, wood: 1 }
    out: { brick: 1 }
  - id: glass
    buildings: [kiln]
    time: 10
    in: { sand: 3, wood: 2 }
    out: { glass: 1 }
  - id: wet-brick
    name: Brick (Wet Mix)
    buildings: [pug-mill]
    time: 4
    in: { clay: 1, sand: 1, water: 2 }
    out: { brick: 2 }
    tags: [alternate]

logistics:
  - { id: cart, name: Cart, aliases: [wheelbarrow], carries: solid, capacity: 30 }
  - { id: pipe, name: Pipe, carries: fluid, capacity: 120 }

resources:
  - { item: clay, limit: 600 }
  - { item: sand, limit: 400 }
  - { item: water }
  - { item: wood }
```

What each section means:

| Section | Entries | Notes |
| --- | --- | --- |
| `units` | `rate` | The unit of `capacity` and `limit` below, and how the app shows rates for your pack. Documents store items per second whatever you choose |
| `items` | `id`, `name`, `form` (`solid` or `fluid`), `icon?`, `aliases?` | Solids ride belts, fluids pipes. Aliases are other words people search for |
| `buildings` | `id`, `name`, `speed?` (1), `power?` (`consume`, `produce` in MW), `fields?`, `icon?`, `aliases?` | `fields` holds whatever your plugin reads (here a temperature range); the app doesn't interpret it |
| `recipes` | `id`, `buildings`, `time`, `in`, `out`, `name?`, `tags?` | `time` is seconds per craft at speed 1; amounts are per craft. The first building is the default. A recipe without a name is named after its first output. `tags: [alternate]` puts it under the save profile's alternate recipes |
| `logistics` | `id`, `carries`, `capacity`, `name?`, `aliases?` | Belts and pipes; `capacity` is in your rate unit |
| `resources` | `item`, `limit?`, `extractors?` | Raw inputs. `limit` is the most the map yields, in your rate unit; the totals card warns when a factory needs more |

Ids follow the same rules as the pack id. An item id may carry a variant after `@` (`steam@500`, `gear@rare`) for plugins that model temperatures or quality. Probabilistic outputs are written as expected values (`0.25`).

> [!TIP]
> Items get icons from `icon: icons/<name>.webp`, a path inside the pack. Without one, the app draws the item's initials in a colour of their own, which is fine to start with. Keep icons square; `carbonara-pack import` converts a game's own images for you (see [[Guides/Plugin authoring]], Importing game data).

## 3. Check it

```bash
pnpm carbonara-pack validate packs/brick-works
```

`validate` reads the pack exactly as the app does, checks that every reference resolves and no id is defined twice, and type-checks a TypeScript plugin. A valid pack prints `Brick Works 0.1.0 is valid`. Otherwise you get every problem with its file, line and column, which most terminals and editors open with a click:

```
packs/brick-works/data/production.yaml:9:11: recipes[0].in.mud: Unknown item 'mud'
```

The exit code is 0 for a valid pack and 1 for one with problems, so `validate` also works in a CI job.

## 4. Try it in the app

- **Inside `packs/`:** run `pnpm dev` and open http://127.0.0.1:5173. The dev server builds every pack in `packs/` into the app and rebuilds when a file changes, so your pack is in the *New factory* dialog's game list and the page reloads as you edit. While a pack is broken, the dev server shows the same messages as `validate`, in the terminal and over the page.
- **Anywhere else:** build it (step 6) and install the `.cpack`: in the app, *Game packs* in the top bar → *Install from file…*, or drop the file on the window. `pnpm carbonara-pack dev <folder>` rebuilds the `.cpack` on every change; install it again to see the change.

Start a factory for your game, add recipes from the command palette (`Ctrl K`, type "brick"), connect them through their ports and set a target on an output. If rates look off by a factor of 60, check `units`.

## 5. Add a starter factory

A starter factory is a small factory the app can open for your game: the first run opens one with the welcome tour, so a new player's first look at your game is a working line rather than an empty canvas. It's optional; without one the first run opens an empty factory.

Starters are files in the pack's `starters/` folder, one factory each, in YAML or JSON. The file name is the starter's id (`starters/bricks.yaml` is `bricks`), so it follows the id rules; the first in name order is the one the first run opens. `starters/bricks.yaml`:

```yaml
name: Brickyard # new documents are named after it
description: Clay fired into bricks, with room for a glass line.
graph:
  nodes:
    clay: { kind: source, item: clay }
    wood: { kind: source, item: wood }
    kilns: { kind: recipe, recipe: brick }
    bricks: { kind: sink, item: brick, targetPerSecond: 0.5 }
    hint: { kind: note, text: "Next: Glass, from sand. Add it from the palette and connect both sides." }
  edges:
    clay-kilns: { from: clay, to: kilns, item: clay }
    wood-kilns: { from: wood, to: kilns, item: wood }
    kilns-bricks: { from: kilns, to: bricks, item: brick }
layout:
  root: # canvas positions in pixels, left to right along the flow, about 320 apart
    clay: { x: 0, y: 0 }
    wood: { x: 0, y: 160 }
    kilns: { x: 320, y: 40 }
    bricks: { x: 700, y: 40 }
    hint: { x: 320, y: -160 }
```

- A starter is a document's `graph`, `layout`, `blueprints` and `settings` ([[Architecture/Documents]] describes every node kind). Rates in it are **items per second**, whatever the pack's unit: `targetPerSecond: 0.5` is 30 bricks a minute.
- `validate` checks that every recipe, building, item and belt a starter uses is in your data, and that every flow joins nodes the starter has.
- The easiest way to make one: build the factory in the app, save it (*Save factory file*, `Ctrl S`), and unzip the `.carbonara` file, which is gzipped JSON: `gunzip -c Brickyard.carbonara > starters/brickyard.json`. The fields a starter doesn't take (`id`, `pack`, `format`, `version`) are ignored.
- Make it teach: leave a gap where the next machine goes and say so in a note. The tour asks the player to add a recipe, connect it on both sides and set a target, and your starter is where they do it.

`carbonara-pack new` leaves the template's starter out, because it uses the template's items. Starters need pack format 1.1, so keep `engine: ^1.1` in the manifest.

## 6. Build the `.cpack`

```bash
pnpm pack:build packs/brick-works                       # or: pnpm carbonara-pack build <folder> [--out <folder>]
# Built dist/packs/brick-works-0.1.0.cpack
# SHA-256 183d557ab200…
```

The build bundles `plugin/index.ts` (and whatever it imports) into `plugin/index.js` with esbuild, checks the pack like `validate` does (except the type check), and zips the folder. Builds are reproducible: the same folder gives the same bytes and so the same SHA-256, which is the pack's identity and what the install prompt shows.

## 7. Publish it

A `.cpack` file is the whole pack: publish it wherever people download things (a release on your repository, a game's modding site). People install it with *Install from file…* in the pack manager, by dropping it on the app, or by opening it with the desktop app. Before anything of yours runs, they see a trust prompt with the pack's name, id, version, game and SHA-256; publish the hash next to the file so they can compare. Installed packs run their plugin in a sandbox ([[Architecture/Plugins]], The plugin sandbox).

Before you publish:

- **Version:** raise `version` (semver) with every release. Installing a pack whose id is installed replaces it; documents remember the version they were planned with.
- **README.md:** which game, which game version, what's in it and what isn't. The pack manager shows it.
- **CREDITS.md:** where the data and icons come from. If they come from a game, record the publisher's permission or the fan-content policy that covers them ([[Architecture/Game packs]], Assets and permissions).
- **`engine`:** `^1.1` while your pack uses starters (or anything else from pack format 1.1); `^1` otherwise. A Carbonara that reads an older format refuses the pack with a clear message instead of half-loading it.

## Editor help

Point your editor at the schemas for completion and inline errors. With the YAML language server (VS Code's YAML extension), a comment on the first line does it:

```yaml
# yaml-language-server: $schema=../../schemas/pack-data.schema.json
```

`schemas/pack-manifest.schema.json` is for `manifest.yaml`, `schemas/pack-data.schema.json` for the files in `data/`, and `schemas/pack-starter.schema.json` for starters. Adjust the relative path to where your pack lives.

## Checklist

- [ ] `pnpm carbonara-pack validate <folder>` says the pack is valid
- [ ] A factory for the game solves in the app, with sensible rates in the game's unit
- [ ] A starter factory, if you want new players to start in your game
- [ ] README and CREDITS written; version raised; `.cpack` built and its SHA-256 published with it
