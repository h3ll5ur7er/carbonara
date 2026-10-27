# Game packs

A game pack adds one game to Carbonara. It's a single zip archive with the extension `.cpack`, and it **always** contains both the game's data and its plugin. A document uses exactly one pack.

[TOC]

## Archive layout

```
satisfactory.cpack              # zip archive
├─ manifest.yaml                # identity, versions, entry points
├─ data/                        # JSON or YAML, as many files as you like, merged in order
│  ├─ items.yaml
│  ├─ buildings.yaml
│  ├─ recipes.yaml
│  ├─ logistics.yaml
│  └─ resources.yaml
├─ plugin/
│  └─ index.js                  # bundled ESM: definePlugin({...}), see Plugins
├─ icons/                       # WebP, referenced from data
├─ locales/                     # optional: en.yaml, de.yaml … for names
├─ CREDITS.md                   # asset sources, permissions, attribution
└─ README.md                    # shown in the pack manager
```

## Manifest

```yaml
id: satisfactory
name: Satisfactory
version: 1.2.0                   # pack version (semver)
engine: ^1                       # pack format / plugin API version it targets
game: { name: Satisfactory, version: "1.1" }
data: data/
plugin: plugin/index.js          # required; the template ships a no-op plugin
theme: { accent: "#f5a623" }     # tints the UI
```

## Data

```yaml
units: { rate: per_minute }
items:
  - { id: iron-ore,   name: Iron Ore,   form: solid, icon: icons/iron-ore.webp }
  - { id: iron-ingot, name: Iron Ingot, form: solid }
  - { id: water,      name: Water,      form: fluid }
buildings:
  - id: smelter
    name: Smelter
    power: { consume: 4 }             # MW
    fields: { clock: { min: 1, max: 250, default: 100 } }   # interpreted by the plugin
recipes:
  - id: iron-ingot
    building: smelter
    time: 2                            # seconds per craft
    in:  { iron-ore: 1 }
    out: { iron-ingot: 1 }
  - id: alt-pure-iron-ingot
    building: refinery
    time: 12
    in:  { iron-ore: 7, water: 4 }
    out: { iron-ingot: 13 }
    tags: [alternate]
logistics:
  - { id: belt-mk1, name: Conveyor Belt Mk.1, aliases: [mk1 belt], carries: solid, capacity: 60 }
  - { id: pipe-mk1, carries: fluid, capacity: 300 }
resources:
  - { id: iron-ore, extractors: [miner-mk1, miner-mk2], nodes: { impure: 39, normal: 42, pure: 46 } }
```

`aliases` let plain language ("yellow belt") resolve to data, for the MCP tools and the command palette.

The zod schemas in `src/contracts/` are the source of truth. JSON Schema is generated from them for pack authors and editors.

## Built-in and third-party packs

- **Built-in packs:** the app ships every pack we maintain (`packs/satisfactory`, `packs/factorio`, …). They're built at app build time, preinstalled and trusted, and they update with the app. They can also be updated on their own, without an app release.
- **Third-party packs:** drop a `.cpack` on the app, open it with a file dialog, or double-click it on desktop. The `packs` manager reads it, the `packs` engine validates the manifest and data and checks the `engine` range, and errors name the file plus the YAML line and column. Because a pack contains code, installing one shows a trust prompt with its id, version and hash ([[Architecture/Plugins]]). Installed packs are stored in OPFS (web) or the app data folder (desktop).
- **Identity:** a pack is content-addressed (a hash of the whole archive). Documents record pack id, version and hash. When a document's pack is missing or has a different version, opening it offers to install or migrate.

## Authoring

- `carbonara-pack new <id>` scaffolds a pack from `packs/_template`, a small original example game with a no-op plugin. The template is the starting point for authors and a test fixture; the app doesn't list it.
- `carbonara-pack validate`, `build` (bundles the plugin with esbuild and zips it into a `.cpack`) and `dev` (the app loads the unpacked folder and reloads it on change). On the web, dev mode uses the File System Access API; on desktop the shell watches the folder.
- `carbonara-pack import <game> --from <file>` runs the pack plugin's importer to regenerate `data/` from the game's own data files (Satisfactory's `Docs.json`, Factorio's `--dump-data` output) when a game updates. Icons are sourced once and normalised to WebP at fixed sizes.
- The MCP server exposes the same steps as tools for AI-assisted authoring ([[Architecture/MCP server]]).

## Assets and permissions

Every pack bundles its full data and icons; there are no install-path lookups at runtime. Before we publish a build that includes a game's pack, we get the publisher's OK or confirm their fan-content policy covers it, and record the result in the pack's `CREDITS.md`. Each pack is a separate unit, so a takedown request affects only that game's pack.

## Scope

v1 supports one pack per document. Mod packs that extend a base pack (`extends: factorio`) are a later addition, and the manifest leaves room for it.
