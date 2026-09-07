# Furtivespy's discord.js bot

This discord.js bot has some heavy influence from [An Idiots Guide bot](https://github.com/AnIdiotsGuide/guidebot). 

## Introduction

This project is a bot I created for a discord chat with friends and to better learn node

# What this bot does? 

Check out the commands folder for a list of commands

## Admin: multi-server config overview

`/config overview` (always ephemeral) lists key settings for every guild Bender has joined. Use it instead of SSHing into Enmap/SQLite.

**Who can use it**

- Discord user ID must match `botOwnerId` in `config.json`, or be listed in `adminIds` or `admins` (arrays) in `config.json`.
- Discord also hides `/config` from members without Administrator, so run it in a server where you can see the command.

**What it shows (one section per guild)**

- Guild name + id
- Personality (set vs default Bender)
- Chat knobs: prefix, random response %, Markov level, mention cooldown if one is stored
- Context pack / published CSV URL: yes/no only — full URLs are never printed
- File Search ready (store + uploaded transcript count)
- High-signal flags: disabled commands, skip-channel count, `/people` mappings, backfill status, starboard, admin/mod role names

Missing and default values are labeled. Tokens and leftover secret-looking overrides are redacted. A copy of the same redacted report is written to the bot log when the command runs. The command does not post to public channels.




