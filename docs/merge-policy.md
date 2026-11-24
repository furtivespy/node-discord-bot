# Merge policy

How a pull request gets from "agent opened it" to "merged and released".

## Gates

Required on `master` (ruleset `protect master`): `lint` and `test` (`.github/workflows/test.yml`). Together they run `npm run verify` (`npm run lint && npm test && npm run smoke`, with the Feature Map drift test included in `npm test`).

An agent may merge a PR (`ship-pr --merge`, see `.agents/skills/ship-pr/SKILL.md`) only when **all** of these hold:

1. `lint` and `test` are green.
2. The PR's **QA Status** block says `Verdict: PASS` and its `Head` equals the PR's current head SHA. A new commit makes an old PASS stale.
3. `For you to test` is `none`.
4. The risk tier is **low** or **medium** (below).
5. The PR has exactly one release label: `patch`, `minor`, or `major`. `release.yml` reads it to cut the next SemVer git tag and GitHub Release; with no label no release tag is created. `major` is high risk, so an agent never merges it.

The Cursor QA review is not a GitHub check, so GitHub cannot require it. The `ship-pr` loop enforces rules 2, 3, and 5 instead.

## Risk tiers

**High: a human merges.** Any of:

- touches `db/`, `modules/enmap.js`, or `scripts/migrate*`;
- touches `Dockerfile`, `fly.toml`, or anything under `.github/workflows/`;
- touches the rules that decide merging, so an agent cannot loosen its own gate: `.github/ship-pr.json`, `.agents/skills/ship-pr/`, `scripts/pr-risk.js`, `docs/merge-policy.md`, or anything under `docs/adr/`;
- changes a slash-command contract: a command or option name, an option type, `defaultMemberPermissions`, or `permLevel`;
- carries the `major` label;
- `User call-out` is not `none` (users need it explained, for example release notes or changed behavior);
- falls under [ADR 0003](adr/0003-agent-defaults-to-no.md) and the task did not explicitly ask for it.

The path rules above are checked in code: `gh pr diff <n> --name-only | node scripts/pr-risk.js` prints `high` when any changed file is on the list. The other rules need judgement. Anyone may *propose* a change to these files in a PR; the point is that a person, not the ship loop, merges it.

**Medium:** new or changed user-facing behavior that is not high (`minor` label, a new command or subcommand, changed command output or chat behavior).

**Low:** everything else (`patch`: fixes, refactors, tests, docs, dependency bumps that are not a major version).

## After merge

`release.yml` creates the SemVer git tag (`vX.Y.Z`) and GitHub Release from the PR label. Production deployment to Fly.io (`bender-bot`) is currently manual via `fly deploy`; see [the rollback runbook](runbooks/rollback.md). Adding automated Fly deployment and a running-version health check to CI is a planned follow-up.
