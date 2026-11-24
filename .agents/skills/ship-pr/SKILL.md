---
name: ship-pr
description:
  Shepherd a pull request in this repo to merged or parked. Use when a PR is
  ready to finish, or when asked to merge, babysit, or "ship" one.
---

# Ship PR

Policy lives in [docs/merge-policy.md](../../../docs/merge-policy.md); the decisions live in `.github/ship-pr.json`. This skill only runs the loop.

1. **Fill the PR template**: Intent, Linear issue, Door, Cleanup, Testing, System recap. Run `npm run verify` and cite the result under Testing (plus any `npm run control` checks run).
2. **QA pass.** The QA agent rewrites the block between `<!-- qa-status:start -->` and `<!-- qa-status:end -->` in the PR description: `Verdict`, `Head` (full head SHA it reviewed), `Verified`, `For you to test`, `User call-out`. It must rewrite the block after every new commit.
3. **Pick the risk tier** from [docs/merge-policy.md](../../../docs/merge-policy.md) (`low`, `medium`, `high`). First run `gh pr diff <n> --name-only | node scripts/pr-risk.js`: if it prints `high`, the tier is high, whatever the PR says. Otherwise judge the rest of the policy yourself. A `User call-out` that is not `none` also makes it high.
4. **Gather state and ask for the next step:**

   ```sh
   gh pr view <n> --json number,url,state,isDraft,mergeable,mergeStateStatus,headRefOid,statusCheckRollup,reviewDecision,body
   npx kcd-skills@latest autopilot ship-pr --input state.json --risk <tier> --json
   ```

   `npx kcd-skills@latest autopilot ship-pr --schema` prints the state format. Map checks to `{name, status}` (use the check names, for example `lint` and `test`), and set `headSha` to `headRefOid`.

   The Cursor QA run is a comment, not a GitHub review, so add `{"login": "cursor", "state": "COMMENTED"}` to `reviews` **only when all three hold**: `Verdict: PASS`, `Head` equals the current `headRefOid`, and `For you to test` is `none`. If `Head` is stale or `For you to test` is not `none`, **park for the owner**: do not merge, leave a short PR comment with why and what the owner must do, and stop. Do not omit the review and wait. If Verdict is not PASS yet, leave `reviews` empty and the loop returns `wait-for-review`.
5. **Do the one action it returns**: fix CI, address review threads (fix it, or reply with why), resolve conflicts, mark ready, wait, or merge. Reviewers check every changed test expectation against the intent. Then repeat step 4 with fresh state.
6. **Merge** only when the step is `merge` **and the PR has exactly one release label**, using a merge commit (`gh pr merge <n> --merge`). `release.yml` tags from that label; with no label no SemVer release is created. Check first:

   ```sh
   gh pr view <n> --json labels --jq '[.labels[].name | select(. == "patch" or . == "minor" or . == "major")]'
   ```

   - Exactly one: go on.
   - None: add the one that matches the risk tier (`low` is `patch`, `medium` is `minor`) with `gh pr edit <n> --add-label <label>`, unless the diff clearly calls for a different one.
   - More than one, or `major`: park for the owner. `major` makes the PR `high` (see [docs/merge-policy.md](../../../docs/merge-policy.md)).

   `high` risk always parks for the owner. Stale QA Head and `For you to test` not `none` also park (step 4).
7. **After merge**, `release.yml` creates the SemVer git tag and GitHub Release. Production deploy to Fly.io (`bender-bot`) is currently manual (`fly deploy`); see [docs/runbooks/rollback.md](../../../docs/runbooks/rollback.md) for deploy and verification steps.
8. **Leftovers and friction:** file follow-ups as Linear issues in the **Bender Bot** project (team Furtivespy), with a priority; add the `needs-decision` label when the owner must decide. If the PR cost you time because of the repo itself (a flaky check, a wrong doc, a missing fixture), file it by following [friction-log](../friction-log/SKILL.md). Nothing met the bar? File nothing. If the PR leaves something to remove later, check that its Cleanup section links a `Cleanup:` issue (see "Cleanup tickets" in [AGENTS.md](../../../AGENTS.md)); if it says `none` but the PR left a shim, old path, or preserved old records, file one and link it before merging.
