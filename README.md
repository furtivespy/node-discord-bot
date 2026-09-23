# Furtivespy's discord.js bot

This discord.js bot has some heavy influence from [An Idiots Guide bot](https://github.com/AnIdiotsGuide/guidebot).

## Introduction

A bot for friend Discord servers, originally written to learn Node.

## What this bot does

Use `/help` in Discord. It lists the live slash commands (chat, fun, games, lookups, admin). Mention Bender in a message to chat.

Slash commands live under `slashcommands/` and register on startup.

## Per-server context packs (play tracker CSV)

Admins can register a published CSV URL so Bender can answer games/stats questions from that server's play tracker (or later, other context packs). The URL is a secret capability — do not commit it.

See [CONTEXT_PACKS.md](CONTEXT_PACKS.md) for how to publish a Google Sheet, register it with `/context attach` (aliases: `set`, `add`), and how that data is attached to chat without changing grounding (Google Search and File Search stay XOR). Server admins can `/context list` for a short freshness summary, `/context preview` for a redacted sample, `/context status` for last-fetch / row-count / error freshness (including the published URL), and `/context refresh` to re-download now.

## Admin multi-server config overview

`/config overview` lists key settings for every guild the bot has joined. It is
read-only and always replies **ephemerally** (only the invoker sees it), so it
is safe to run in a public channel.

**Who can use it**

- `config.json` `botOwnerId`
- optional `admins` or `adminIds` arrays in `config.json`
- the Discord application owner, if `appInfo.owner` is a user

Guild administrators who are not in that list can see the subcommand (the
parent `/config` command is Discord-admin-visible) but get a permission error.

**How to run**

1. Deploy a build that includes this command, then restart so slash commands
   re-register.
2. In any server, run `/config overview`.
3. Optional: `format: json` for a redacted JSON dump.
4. Optional: `log: True` to also write the same redacted report to bot logs.

Each guild section includes personality, chat knobs, `adminRole` / `modRole` /
`systemNotice`, context-pack yes/no, File Search, backfill, people, starboard,
bringo, disabled commands, skip-channel count, and any other overrides.

Tokens, API keys, and full published CSV / context-pack URLs are never printed
(including secret-looking values on unexpected keys). Missing or default values
are labeled `(default)` or `unset`. If Discord’s guild list cannot be refreshed,
the report warns that it is using the cached guilds only.

## Admin health / status

`/status` is a single-screen **green / yellow / red** health check for the
server you run it in: process/Discord uptime, last slash-command register note,
context-pack last refresh (same freshness fields as `/context status`, without
pack URLs), and image-gen last result plus the 7-day ok/fail counts from
`/usage`. It always replies **ephemerally**.

This answers “is it working right now?” `/config overview` answers “what’s
configured?” `/context status` is the detailed pack freshness dashboard
(including published URLs). `/status` composes those pack-health fields; it
does not store a second copy.

**Who can use it**

- Server **Administrator**
- `config.json` `botOwnerId`
- optional `admins` or `adminIds` arrays in `config.json`
- the Discord application owner, if `appInfo.owner` is a user

The command is Discord-admin-visible (`default_member_permissions`) and
guild-only. Non-admins who somehow invoke it get an ephemeral permission
error. Bot owner / configured admin IDs can pass `all:True` to scan every
joined server.

**How to run**

1. Deploy a build that includes this command, then restart so slash commands
   re-register.
2. In any server, run `/status`.
3. Optional (bot owner): `/status all:True`.

The embed never prints tokens, API keys, image prompts, or published CSV /
context-pack URLs. Scrubbed error text may appear when a check failed. Image-gen
“last error” is an in-memory probe for this process; 7-day rates come from the
existing usage pulse.

## Dependency updates

Dependabot version updates live in [`.github/dependabot.yml`](.github/dependabot.yml). Once that file is on `master` **and** Dependabot is enabled in GitHub, weekly PRs show up from the `dependabot` bot:

- **npm** at the repo root (`package.json` / `package-lock.json`): patch and minor bumps are grouped into one PR; major bumps stay as individual PRs
- **GitHub Actions** in `.github/workflows`: same grouping

There are no ignore rules or private-registry secrets in the config, so updates are not silently disabled.

**After merge, a repo admin (Will) must confirm in GitHub:** Settings → Advanced Security → Dependabot — enable **version updates** (this config does nothing until that toggle is on). Alerts and security updates are separate and recommended. Then check the **Insights → Dependency graph → Dependabot** tab (or the first weekly PRs) for a successful run or a clear “no updates” state.

This repo’s release workflow tags merges that carry a `major` / `minor` / `patch` label. Dependabot may apply those SemVer labels automatically. Remove the label before merge if you do not want a release tag.
