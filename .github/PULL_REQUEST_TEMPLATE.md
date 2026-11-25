## Intent

<!-- What this changes and why, in a few sentences. -->

## Linear

<!-- e.g. FUR-123 -->

## Door

<!-- two-way (easy to revert) | one-way (data, contracts, releases) -->

## Cleanup

<!-- none | needed (FUR-123) | done. Does this PR leave something to remove later (a shim, an old code path, preserved old records, a flag)? If so, file a `Cleanup:` issue and link it here. See "Cleanup tickets" in AGENTS.md. -->

none

## Testing

<!-- Commands run and their results (`npm run verify`, `npm run control ...`). Say what you could not verify. -->

## System recap

<!-- Optional for small fixes; required for structural changes: what primitives or ADRs this touches and why. -->

none

## QA Status

<!-- Maintained by QA Department (or workflow skip stamp for docs-only/non-runtime PRs): rewrite everything between the markers after every QA pass. A verdict is only valid while Head equals the PR's current head SHA. See docs/merge-policy.md. -->
<!-- qa-status:start -->
- **Verdict:** pending
- **Depth:** pending
- **Head:** -
- **Verified:** -
- **For you to test:** none
- **User call-out:** none
<!-- qa-status:end -->

## Checklist

- [ ] New slash commands live under `slashcommands/<area>/` with a concise `description`. Set `category` (e.g. `chat`, `admin`) or `hidden: true` when the folder default is wrong. `/help` lists loaded slash commands automatically — do not add prefix-era (`!command`) docs to user-facing help.
- [ ] If slash commands or subcommands were added, renamed, or removed: updated `docs/feature-map/notes.md` and ran `npm run control map --write`.
- [ ] Tests added or updated for the behavior change
- [ ] PR has exactly one of: `major` | `minor` | `patch` (release tag workflow)
