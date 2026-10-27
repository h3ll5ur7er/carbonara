# Carbonara

Carbonara is a node-based factory planner for automation games such as Satisfactory and Factorio. You place machines and connect them on a canvas, and Carbonara works out live throughput, ratios, shortfalls and belt saturation. Or you name a goal ("2 full yellow belts of steel") and it plans the production line for you.

Carbonara isn't tied to one game. Each game is a **game pack**: a single `.cpack` file containing the game's data and a plugin for its mechanics. The app ships with every pack we maintain. Anyone can build more packs from the template.

It runs in the browser and as a desktop app (Tauri). The desktop app also runs an MCP server, so AI assistants can read and edit your factories.

[TOC]

## Guiding principles

1. **Everything is a linear flow problem.** Every mechanic (overclocking, modules, beacons, heat, quality, somersloops, alternate recipes) is turned into item flows plus linear constraints *before* the solver runs. Non-linear effects, such as the Satisfactory power curve, are computed as derived metrics after the solve. This keeps the core small, fast and generic, and pack plugins never touch Rust.
2. **One engine, two modes.** *Propagate* mode (you place machines and see where flows run short or pile up) and *Optimize* mode (you name goals and the app picks recipes and counts) are the same LP with different pins and objectives.
3. **The UI thread never waits.** Managers, solving, plugin hooks, layout and pack parsing all run in workers. The UI only renders.
4. **Hierarchy is the scaling strategy.** A subgraph compiles to a macro recipe. The top level only solves macro nodes, and a subgraph's inside is solved only when you open it.
5. **The AI is just another user.** Every change, whether it comes from the mouse, the palette, a paste or the MCP server, goes through the same managers. That gives every change undo, a history entry and a ghost preview.
6. **Decompose by volatility.** Components hide things that are likely to change, not features. See [[Architecture]] and [[Conventions]].

## Where to read on

| Page | Covers |
| --- | --- |
| [[Architecture]] | Components, layers and call rules, threads, the tech stack |
| [[Architecture/Solver]] | LP formulation, readable results, performance budgets |
| [[Architecture/Subgraphs]] | Hierarchical pre-computation with macro recipes |
| [[Architecture/Game packs]] | The `.cpack` format, loading, authoring, assets |
| [[Architecture/Plugins]] | Plugin hooks and how game mechanics map onto them |
| [[Architecture/MCP server]] | The desktop app's MCP server and its tools |
| [[Design]] | Visual design and core interactions |
| [[Design/Editor quality of life]] | Auto-arrange, ghost paste, alignment, find, balance … |
| [[Conventions]] | Engineering rules: volatility, TDD, KISS, DRY/WET, SOLID, YAGNI |
| [[Development]] | Setup, scripts and the checks to run before pushing |
| [[Roadmap]] | Waves, milestones, how agents work the board, risks, scope |
