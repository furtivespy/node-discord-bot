# Furtivespy's discord.js bot

This discord.js bot has some heavy influence from [An Idiots Guide bot](https://github.com/AnIdiotsGuide/guidebot).

## Introduction

A bot for friend Discord servers, originally written to learn Node.

## What this bot does

Use `/help` in Discord. It lists the live slash commands (chat, fun, games, lookups, admin). Mention Bender in a message to chat.

Slash commands live under `slashcommands/` and register on startup.

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

## Dependency updates

Dependabot version updates live in [`.github/dependabot.yml`](.github/dependabot.yml). Once that file is on `master` **and** Dependabot is enabled in GitHub, weekly PRs show up from the `dependabot` bot:

- **npm** at the repo root (`package.json` / `package-lock.json`): patch and minor bumps are grouped into one PR; major bumps stay as individual PRs
- **GitHub Actions** in `.github/workflows`: same grouping

There are no ignore rules or private-registry secrets in the config, so updates are not silently disabled.

**After merge, a repo admin (Will) must confirm in GitHub:** Settings → Advanced Security → Dependabot — enable **version updates** (this config does nothing until that toggle is on). Alerts and security updates are separate and recommended. Then check the **Insights → Dependency graph → Dependabot** tab (or the first weekly PRs) for a successful run or a clear “no updates” state.

This repo’s release workflow tags merges that carry a `major` / `minor` / `patch` label. Dependabot may apply those SemVer labels automatically. Remove the label before merge if you do not want a release tag.
