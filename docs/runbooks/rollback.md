# Rollback

Status: written from `fly.toml` and `release.yml`, **not yet rehearsed**. Do one dry run before relying on it.

## How production gets a version

`release.yml` runs on every merged PR with a `major`, `minor`, or `patch` label and creates a SemVer git tag (`vX.Y.Z`) and GitHub Release. It does **not** deploy to Fly.io yet.

Production runs on Fly.io (`app = 'bender-bot'`, region `iad`, persistent volume `bender_data` mounted at `/data`, see `fly.toml`). Deployments are currently manual:

```sh
git checkout master && git pull
fly deploy
```

> Planned follow-up: wire `fly deploy` + a running-version check into CI once `FLY_API_TOKEN` is configured as a GitHub Actions secret.

## Roll back a bad release

Pick one.

**A. Revert (normal path).** Revert the bad PR on `master` through a normal PR, pull `master`, and redeploy:

```sh
git checkout master && git pull
fly deploy
```

Use this when the bad change is understood so `master` stays in sync with production.

**B. Redeploy the previous Fly release image (fastest).** List recent Fly releases and redeploy the last known-good image reference:

```sh
fly releases --image -a bender-bot
fly deploy --image <last-good-image-ref> -a bender-bot
```

Then follow up with option A so `master` matches what is running; otherwise the next `fly deploy` ships the bad change again.

## Confirm it worked

Because Bender Bot is currently a Discord gateway bot with no public HTTP `/health` port (`fly.toml` has `ports = []`), confirm the running bot directly:

1. Check machine state and startup logs on Fly:
   ```sh
   fly status -a bender-bot
   fly logs -a bender-bot
   ```
   Confirm the bot logs `Bot has started` and `Successfully registered application commands.` without uncaught errors.
2. In Discord, run `/status` (ephemeral admin health check) to confirm uptime, slash-command registration, context-pack freshness, and image-gen health.

Once an HTTP `/health` endpoint and CI Fly deploy are added, `npm run control health --sha <commit>` will verify the deployed SHA directly.

## What rollback does not undo

Data. A migration or schema change is not reversed by running an older image. Per-guild SQLite DBs (`<guildId>.sqlite`) and Enmap stores live on the `bender_data` Fly volume (`/data`). Migrations must preserve old rows as backups ([ADR 0001](../adr/0001-data-scope-changes-need-migration.md)); restore from those, not from the image.

## Feature flags

There is no production feature-flag system today. `QA_UNLOCK_ADMIN_COMMANDS` is strictly a local/QA test-bot override and must never be enabled in production ([ADR 0003](../adr/0003-agent-defaults-to-no.md)).

## Not covered yet

Automated backups and a tested restore of `/data` (`bender_data`) are out of scope for now (rung 9 in the autopilot audit).
