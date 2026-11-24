# Primitives

The shared building blocks of Bender Bot and which decisions constrain them. Read the matching entry and its ADRs before adding or changing a primitive; reuse an existing primitive instead of creating a second one that does the same job. If a PR adds or reshapes a primitive, or adds/supersedes an ADR, update this catalog in the same PR.

ADRs live in [docs/adr/](adr/).

## Guild storage (SQLite & Enmap)

Per-guild SQLite databases (`data/<guildId>.sqlite` locally, `/data/<guildId>.sqlite` on Fly) storing Markov chains, starboard records, real-name mappings (`people`), archived messages (`chat_messages`), backfill progress, and transcript exports; plus Enmap key-value stores (`settings`, `exclusions`, `gamedata`, `skipChannels`, `usagePulse`).

- Code: `db/db.js`, `modules/enmap.js`, `config.js`, `BenderBot.js` (`getDatabase`, `getSettings`, `getExclusions`, `getSkipChannels`, `getGameData`)
- ADRs: [0001](adr/0001-data-scope-changes-need-migration.md), [0003](adr/0003-agent-defaults-to-no.md)
- Notes: Changes under `db/` or `modules/enmap.js` are high risk by path (`scripts/pr-risk.js`) and require a human merge.

## Slash commands & help catalog

Slash command classes loaded dynamically via `klaw` from `slashcommands/<area>/`, registered on startup with optional QA admin unlock, and surfaced automatically in `/help`.

- Code: `base/SlashCommand.js`, `slashcommands/`, `modules/helpCatalog.js`, `modules/guildHelpFeatures.js`, `modules/qaUnlock.js`, `modules/interactionCallback.js`, `BenderBot.js`
- ADRs: [0002](adr/0002-pr-scope-and-approved-design.md), [0003](adr/0003-agent-defaults-to-no.md)
- Notes: Renaming a command or option, or changing permissions, is a user contract change (high risk / hesitate). Never add prefix-era (`!command`) docs to user-facing help. Keep the generated [Feature Map](feature-map/INDEX.md) and [notes.md](feature-map/notes.md) in sync.

## Gemini AI chat, personalities & grounding

Mention-based chat, configurable per-guild personalities, Google Search vs File Search grounding router (XOR), image generation + callout stripping, and Discord message splitting.

- Code: `modules/geminiai.js`, `modules/prompt_components/`, `modules/splitForDiscord.js`, `modules/imageCallout.js`, `commands/other/ChatBot.js`, `slashcommands/util/setpersonality.js`, `slashcommands/util/prompt.js`
- ADRs: [0002](adr/0002-pr-scope-and-approved-design.md), [0003](adr/0003-agent-defaults-to-no.md)
- Notes: Keep Google Search and File Search grounding XOR; scrub keys/tokens/URLs from errors and logs.

## Per-server context packs

Published Google Sheet CSV URLs attached per guild, SSRF-checked, cached with TTL, formatted for chat context, and inspected via `/context` and `/status`.

- Code: `modules/contextPacks.js`, `modules/contextPackFreshness.js`, `slashcommands/util/context.js`, `CONTEXT_PACKS.md`
- ADRs: [0003](adr/0003-agent-defaults-to-no.md)
- Notes: Published CSV URLs are secret capabilities — never print them in logs, `/context list`, `/context preview`, `/config overview`, or `/status` (only `/context status` shows URLs to admins, and error text must always scrub them).

## Chat archive, backfill & File Search

Live message archiving, background channel/thread backfill worker, monthly/weekly transcript compilation, and Gemini File Search uploads.

- Code: `modules/chatArchive.js`, `modules/chatBackfill.js`, `modules/chatTranscripts.js`, `modules/chatFileSearch.js`, `slashcommands/util/backfill.js`, `slashcommands/util/people.js`
- ADRs: [0001](adr/0001-data-scope-changes-need-migration.md), [0003](adr/0003-agent-defaults-to-no.md)

## Admin health, config overview & usage pulse

Ephemeral admin operational views (`/status`, `/config overview`, `/usage`) plus Bugsnag error logging and bot presence updates.

- Code: `modules/guildHealth.js`, `modules/guildConfigOverview.js`, `modules/usagePulse.js`, `modules/bugsnagLogger.js`, `modules/Logger.js`, `modules/botActivity.js`, `slashcommands/util/status.js`, `slashcommands/util/config.js`, `slashcommands/util/usage.js`, `slashcommands/util/statusupdate.js`
- ADRs: [0003](adr/0003-agent-defaults-to-no.md)
- Notes: `/status` composes context-pack freshness and 7-day `/usage` stats without storing duplicate copies. Never expose tokens, keys, prompts, or pack URLs.

## External lookup adapters

BoardGameGeek XML search/details, Open Library books, Urban Dictionary, Wikipedia, and Reddit image fetching.

- Code: `modules/boardgamegeek.js`, `modules/bggXmlParser.js`, `modules/openLibrary.js`, `modules/UrbanDictionary.js`, `modules/redditImageFetcher.js`, `slashcommands/info/`
- ADRs: [0003](adr/0003-agent-defaults-to-no.md)

## Release, CI & merge gate

GitHub Actions tests + lint, SemVer tag/release workflow, Dockerfile & Fly config, and the `ship-pr` merge-risk gate.

- Code: `.github/workflows/`, `.github/ship-pr.json`, `Dockerfile`, `fly.toml`, `scripts/pr-risk.js`, `docs/merge-policy.md`, `docs/runbooks/rollback.md`
- ADRs: [0003](adr/0003-agent-defaults-to-no.md)
- Notes: Touching any of these paths is high risk (`scripts/pr-risk.js`) and requires a human merge.

## Local verification CLI

Offline command runner, environment doctor, and Feature Map generator/checker (`npm run control`).

- Code: `scripts/control-bender.js`, `scripts/control/`, `scripts/control-fixtures/`, `scripts/smoke-startup.js`, `.agents/skills/control-bender/SKILL.md`
- ADRs: none
- Notes: Uses fake Discord interactions and isolated temp DBs; see `.agents/skills/control-bender/SKILL.md` for what it cannot prove.
