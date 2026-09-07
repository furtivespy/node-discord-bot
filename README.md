# Furtivespy's discord.js bot

This discord.js bot has some heavy influence from [An Idiots Guide bot](https://github.com/AnIdiotsGuide/guidebot). 

## Introduction

This project is a bot I created for a discord chat with friends and to better learn node

# What this bot does? 

Check out the commands folder for a list of commands

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




