<!-- genbeya:begin -->

## Tasks and wiki (Genbeya)

This project plans its work as Genbeya tasks and documents itself in a Genbeya wiki, both plain Markdown files in this repository.

- Use tasks instead of an internal todo list. Tasks are files in `tasks/` named after their ID (`CARB-12.md`). Create one for work you plan, keep its `status` current as you go, and tick its checklist.
- Use the wiki instead of private memory files. Pages are Markdown files in `docs/`, starting at `docs/Home.md`. Read the relevant pages before you change an area, and record durable project knowledge there.
- `.genbeya.yml` holds the workflow states, the task prefix and the folders. If `git worktree list` shows a worktree inside `.git/genbeya/`, its `.genbeya-content` file says which areas (`wiki`, `tasks`, `settings`) live there (`branch`) and which in the checkout (`checkout`); without that file all three live there. Edit and commit an area on the content branch in that worktree.
- Reference tasks, pages and files as `[[CARB-12]]`, `[[Page title]]` or `[[src/file.ts#L10-L20]]`, and name the task in commit messages and pull requests.
- The `genbeya` skill (`.agents/skills/genbeya/SKILL.md`) describes the file formats and the workflow in detail.

<!-- genbeya:end -->

## Engineering conventions

Read [Conventions](docs/Conventions.md) and [Architecture](docs/Architecture.md) before writing code. In short:

- **Decompose by volatility (iDesign).** Clients → managers → engines/access → platforms; contracts and utilities everywhere. No sideways calls, managers talk only through events, engines are pure. ESLint enforces the layers.
- **TDD.** Write the failing test first, make it pass simply, refactor. Bugs start with a reproducing test. Property tests for invariants.
- **KISS, YAGNI.** The simplest design that meets the task's definition of done; no hooks, options or abstractions without a caller.
- **DRY for knowledge, WET for code until the third occurrence.** Schemas and contracts are the single source of truth; generate, don't copy.
- **SOLID.** One area of change per component; new games arrive as packs, never as special cases in the core.

## Before you push

Run `pnpm check` and `cargo test` (see [Development](docs/Development.md)). Never push red. Commit messages start with the task ID (`CARB-12: …`).
