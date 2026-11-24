---
name: control-bender
description:
  Verify a change to Bender Bot yourself before asking a human. Use when you
  changed a slash command, module, or config and need to run it, inspect the
  Feature Map, or check the machine and deploy state.
---

# control-bender

`npm run control -- <command>` runs Bender Bot's own code without Discord. Add `--json` to any command for machine-readable output. Exit 0 means success, 1 means a check failed, 2 means the call was wrong.

Start with `npm run control -- doctor`. If it fails, fix that first: a stale `node_modules`, mismatched Node/npm version, or missing `openssl` makes test results untrustworthy.

## Pick the command

| You need to... | Run |
| --- | --- |
| Check your local machine matches CI | `npm run control -- doctor` |
| Find what a slash command does, what it needs, and what tests cover it | `npm run control -- map <command>` |
| Check the Feature Map is in sync with `slashcommands/` | `npm run control -- map --check` |
| Regenerate `docs/feature-map/INDEX.md` | `npm run control -- map --write` |
| See what a slash command replies without Discord | `npm run control -- execute <fixture.js> [--contains "text"]` |
| Check deployed Fly / health status | `npm run control -- health [--origin <url>] [--sha <commit>]` |

## Run a slash command

1. `npm run control -- map <command>` shows the generated entry plus the hand-written **Seed** (state it needs) and **Reach** (how to run it) notes.
2. Copy the closest file in `scripts/control-fixtures/` and adapt it. A fixture exports `export default async function (ctx) { ... }`:
   - `await ctx.run("ping")` or `await ctx.run("roll", { strings: { dice: "2d6" } })` for stateless commands.
   - `await ctx.run("help", { strings: { command: "wiki" } })` — `ctx` loads all slash commands into `client.slashcommands` automatically.
   - `ctx.withTempDb(guildId, (db) => { ... })` or `ctx.client.getDatabase(guildId)` opens an isolated SQLite DB under a temp directory so fixtures never pollute `data/`.
   - Option keys: `subcommandGroup`, `subcommand`, `strings`, `integers`, `numbers`, `booleans`, `users`, `channels`.
   - `clientExtras` / `interactionExtras` let you inject stubbed stores (`settings`, `config`, `geminiAI`, `usagePulse`, `imageGenProbe`) or admin/owner flags (`isAdmin: true`, `isOwner: true`, `nsfw: true`).
3. Run:
   ```sh
   npm run control -- execute scripts/control-fixtures/<name>.js --contains "<expected text>"
   ```

Read the output for two things: the reply/embed text and any `LOGGED ERROR` lines. Most commands catch their own errors and reply with a generic message, so a normal-looking reply can hide a failure; `execute` exits 1 when a command logs an error.

For a change you are making, also add or update a regression test under `test/`. Fixtures are for quick local proof; tests are for keeping.

## What `execute` cannot prove

It uses a fake Discord interaction with isolated temp storage and no Discord gateway. It cannot prove:
- how Discord renders embeds, mentions, or message components;
- button, select-menu, or modal clicks in Discord;
- Discord `defaultMemberPermissions` visibility or gateway intents (use a local test bot with `QA_UNLOCK_ADMIN_COMMANDS=1` as documented in `README.md` when testing admin commands);
- live Gemini AI, BoardGameGeek, Open Library, Urban Dictionary, Wikipedia, Reddit, or Google Sheet CSV network responses.

List anything unverified under **"For you to test"** in the PR instead of claiming it verified.

## Keep the map current

When you add, rename, or remove a slash command or subcommand:

1. Update `docs/feature-map/notes.md` (a `## /command` section with `- Seed:` and `- Reach:` lines).
2. Run `npm run control -- map --write`, then `npm run control -- map --check`.

`npm test` (via `test/featureMap.test.js`) fails when the map drifts, so CI catches a skipped step.
