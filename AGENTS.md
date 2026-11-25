# Agent Guidance

Bender Bot — a Discord bot for friend servers (ESM Node.js 26, discord.js 14, SQLite/Enmap, Gemini AI chat & image generation, per-server context packs, chat archive & File Search). Agents open most PRs; the owner owns product decisions.

## Verify

`npm run verify` is the one local gate: Biome lint (`npm run lint`), `npm test` (which includes the Feature Map drift check), and `npm run smoke`. CI runs the same checks as the `lint` and `test` jobs in `.github/workflows/test.yml`. Run `npm run verify` before you push. `npm run hooks:install` (once per clone) makes `git push` run `npm run lint` first.

Beyond tests, `npm run control` lets you inspect and exercise slash commands locally without Discord (`doctor`, `map`, `execute`, `health`). Start with [.agents/skills/control-bender/SKILL.md](.agents/skills/control-bender/SKILL.md). Anything it cannot prove (real Discord rendering, permissions, button/select clicks, live Gemini/BGG/Wikipedia/sheet network calls) goes under "For you to test" in the PR.

## Map

- Slash commands, what each needs, and how to run it: [docs/feature-map/INDEX.md](docs/feature-map/INDEX.md) and [docs/feature-map/notes.md](docs/feature-map/notes.md) (`npm run control map <command>`). Update `docs/feature-map/notes.md` and run `npm run control map --write` when you add, rename, or remove a slash command or subcommand.
- Shared building blocks and the ADRs that constrain them (read before adding or changing a primitive): [docs/primitives.md](docs/primitives.md)
- Merging, risk tiers, and the QA Status block: [docs/merge-policy.md](docs/merge-policy.md)
- Shipping a PR: [.agents/skills/ship-pr/SKILL.md](.agents/skills/ship-pr/SKILL.md)
- Filing friction (repo papercuts) in Linear: [.agents/skills/friction-log/SKILL.md](.agents/skills/friction-log/SKILL.md)
- Scheduled cleanup agents and their prompts: [docs/cleanup-automations.md](docs/cleanup-automations.md)
- Decisions to read before proposing big changes: [docs/adr/](docs/adr/)
- Deploying and rolling back a release: [docs/runbooks/rollback.md](docs/runbooks/rollback.md)

## Linear

This repo's Linear project is **Bender Bot** (team **Furtivespy**, key `FUR`).

When the user mentions Linear, issues, or project tracking for this codebase, scope work to the **Bender Bot** project unless they say otherwise. Put the issue ID (`FUR-123`) in the PR title, branch, and Linear section so Linear links the PR.

## Cleanup tickets

If your PR leaves something that should be removed later, file a `Cleanup:` issue before you finish, and link it in the PR's Cleanup section. Examples: a compatibility shim, an old code path kept during a rollout, old records preserved by a migration, or a temporary override. Nothing left behind? Write `none`.

Create it in Linear (team **Furtivespy**, project **Bender Bot**) from the **Cleanup** template, with label `cleanup`. Fill every section:

- **What to clean up:** one thing, naming the files.
- **Why it is safe:** what proves nothing depends on it.
- **Ready when:** a check anyone can run that is true exactly when the cleanup is safe to do now, for example "`rg legacyFoo` finds no callers outside `modules/legacyFoo.js`". If you cannot write one, it is not ready; say what you would need to know and add `needs-decision`.
- **Door:** `two-way` or `one-way`. Deleting stored data is one-way: add `needs-decision`, because the weekly legacy reaper does not do those alone.

Use a priority; Low is the default. See [docs/cleanup-automations.md](docs/cleanup-automations.md) for what the weekly reaper will and will not do with these.

## Hard rules (summary of ADRs)

- **Data migrations ([ADR 0001](docs/adr/0001-data-scope-changes-need-migration.md)):** Do not change data scope or storage layout without an explicit, idempotent migration path that preserves old records as backups and stays out of normal command/autocomplete paths.
- **PR scope ([ADR 0002](docs/adr/0002-pr-scope-and-approved-design.md)):** Do not add product behavior beyond an approved design without confirmation. Keep storage migrations separate from optional UX changes.
- **Default to "no" ([ADR 0003](docs/adr/0003-agent-defaults-to-no.md)):** Never add a paid service, leak tokens/API keys/published context-pack CSV URLs, or enable `QA_UNLOCK_ADMIN_COMMANDS` in production. Stop and ask before renaming slash commands/options, changing Discord permissions/intents, touching `Dockerfile`/`fly.toml`/`/data`, changing `release.yml`, or changing Node/npm major pins.
