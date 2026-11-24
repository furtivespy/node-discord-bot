# 0001: Changing data scope needs an explicit migration path

Status: accepted
Date: 2026-11-24

## Decision

Do not move data between scopes (for example per-guild SQLite DBs in `data/<guildId>.sqlite` or Enmap guild keys in `settings`, `exclusions`, `gamedata`, `skipChannels`, `usagePulse` to bot-wide records, or vice versa) without a written migration path. Do not delete old records unless the user explicitly approves it.

Migrations:

- keep the old rows as backups;
- never silently overwrite or delete scoped records with defaults;
- are idempotent: re-running one yields the same result;
- define duplicate precedence before coding, and keep existing records unless the user names another rule;
- stay out of normal command and autocomplete paths, which read only the final storage location;
- are tested with several source records, duplicate IDs, an existing target record, and retained old rows.

## Why

Data lives in SQLite files on a single `/data` volume (`bender_data` on Fly.io) and redeploying an older image cannot undo a migration. A scope change that overwrites or drops rows is the one mistake a code rollback cannot reverse.

## Revisit if

- backups are automated and a restore has been tested, so old rows no longer need to stay in the live database;
- data moves to a store with point-in-time recovery.
