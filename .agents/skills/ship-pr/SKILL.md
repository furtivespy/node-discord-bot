---
name: ship-pr
description:
  Shepherd a pull request in this repo to merged or parked. Use when a PR is
  ready to finish, or when asked to merge, babysit, or "ship" one.
---

# Ship PR

Policy lives in [docs/merge-policy.md](../../../docs/merge-policy.md); the decisions live in `.github/ship-pr.json`. When invoked by the central workflow (`ai-tool-n-docs` `docs/workflow/stages/05-merge-gate.md`), run in a fresh, read-and-merge-only thread: **never edit code or merge `master` into the PR branch inside `ship-pr`** (any new commit makes QA's `Head` SHA stale).

1. **Confirm PR template completeness**: Intent, Linear issue, Door, Cleanup, Testing, System recap. Verify `npm run verify` (plus any `npm run control` checks) is cited under Testing.
2. **QA pass.** QA Department (or the workflow `skip` stamp for eligible docs-only/non-runtime PRs) rewrites everything between `<!-- qa-status:start -->` and `<!-- qa-status:end -->` in the PR description: `Verdict`, `Depth`, `Head` (full head SHA it verified), `Verified`, `For you to test`, `User call-out`. Any new commit requires a fresh QA pass.
3. **Pick the risk tier** from [docs/merge-policy.md](../../../docs/merge-policy.md) (`low`, `medium`, `high`). First run `gh pr diff <n> --name-only | node scripts/pr-risk.js`: if it prints `high`, the tier is high, whatever the PR says. Otherwise judge the rest of the policy yourself. A `User call-out` that is not `none`, a `major` label, or `profile:high-risk` escalation also makes it high.
4. **Gather state and ask for the next step:**

   ```sh
   gh pr view <n> --json number,url,state,isDraft,mergeable,mergeStateStatus,headRefOid,statusCheckRollup,reviewDecision,body
   npx kcd-skills@latest autopilot ship-pr --input state.json --risk <tier> --json
   ```

   `npx kcd-skills@latest autopilot ship-pr --schema` prints the state format. Map checks to `{name, status}` (use the check names, for example `lint` and `test`), and set `headSha` to `headRefOid`.

   QA Department writes a PR block rather than a GitHub review, so add `{"login": "cursor", "state": "COMMENTED"}` to `reviews` **only when all four hold**: `Verdict: PASS`, `Depth` satisfies the diff/profile (never `skip` for runtime code or dependency bumps), `Head` equals the current `headRefOid`, and `For you to test` is `none`. If `Head` is stale or `For you to test` is not `none`, **park for the owner**: do not merge, leave a short PR comment with why and what the owner must do, and stop. Do not omit the review and wait. If `Verdict` is pending or missing for `headRefOid`, return to QA rather than waiting silently.
5. **Route the autopilot action (no code edits here):**
   - `merge`: proceed to Step 6.
   - `wait` or `mark-ready`: handle or report status.
   - Any action requiring code edits, CI fixes, unresolved review threads, or conflict resolution: **do not push code here** — return `needs_code_fix` to Step 2 (within the 6-pass cap) or **park for the owner**.
6. **Pre-merge audits and Merge** only when the step is `merge` **and**:
   - **Pre-merge `Cleanup:` audit:** if the PR left a shim, old code path, or preserved old records while `## Cleanup` says `none`, do not merge — return `needs_code_fix` (or park for the owner) until a `Cleanup:` issue is filed and linked (see "Cleanup tickets" in [AGENTS.md](../../../AGENTS.md)).
   - **Exactly one release label:** check first:

     ```sh
     gh pr view <n> --json labels --jq '[.labels[].name | select(. == "patch" or . == "minor" or . == "major")]'
     ```

     - Exactly one (`patch` or `minor`): go on.
     - None: add the one that matches the risk tier (`low` is `patch`, `medium` is `minor`) with `gh pr edit <n> --add-label <label>`, unless the diff clearly calls for a different one.
     - More than one, or `major`: park for the owner. `major` makes the PR `high` (see [docs/merge-policy.md](../../../docs/merge-policy.md)).

   `high` risk always parks for the owner. Merge using a merge commit (`gh pr merge <n> --merge`). `release.yml` tags from that label; with no label no SemVer release is created.
7. **After merge**, `release.yml` creates the SemVer git tag and GitHub Release. Production deploy to Fly.io (`bender-bot`) is currently manual (`fly deploy`); see [docs/runbooks/rollback.md](../../../docs/runbooks/rollback.md) for deploy and verification steps.
8. **Post-ship friction & follow-ups:** When invoked from the central workflow, durable implementation friction is evaluated post-merge by Step 8 (`ai-tool-n-docs` `docs/workflow/stages/06-post-ship.md`, which resumes the Step 2 thread on `t3-local`); pass any `gate_friction_candidates` you hit (flaky CI, wrong docs, deploy friction) to Step 8. When running `ship-pr` standalone by hand, file follow-ups in the **Bender Bot** project (team Furtivespy, adding `needs-decision` when the owner must decide) and file qualifying repo papercuts via [friction-log](../friction-log/SKILL.md). Nothing met the bar? File nothing.
