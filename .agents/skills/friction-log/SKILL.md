---
name: friction-log
description:
  File a durable papercut you hit while working in this repo as a Linear issue,
  or work through the open ones. Use after finishing a PR, when something cost
  you time or produced wrong output, and when the daily friction sweep picks
  issues to fix.
---

# friction-log

Friction is a papercut in how this repo is built, tested, or run: a slow or flaky check, a doc that is wrong, a missing fixture, a misleading error. Filing it once, well, lets another agent fix it later.

Friction issues live in Linear: team **Furtivespy**, project **Bender Bot**, label `friction`.

## File only what is worth fixing

Every one of these must be true:

- **Durable:** still true tomorrow, not a one-off network blip.
- **Recurring:** it will cost someone again.
- **Reproducible:** another agent can follow your steps and see it.
- **Owned here:** the fix is in this repo, not in Discord, Linear, or a vendor.

If you hit nothing that meets the bar, file nothing. Do not file feature ideas (those are product decisions) or things you could fix in the PR you are working on (fix them there).

## How to file

1. **Search first.** List open issues with label `friction` in the **Bender Bot** project and skip yours if one already covers it. Add a comment with what you saw instead.
2. **One papercut per issue.**
3. **Title:** what is wrong, in one line (`npm test fails on Windows without openssl on PATH`).
4. **Description:** use these headings.
   - What happened
   - What you expected or wanted
   - How to reproduce (exact commands, branch or commit)
   - Cost (time, retries, wrong output)
   - Relevant files or commands
5. **Labels:** `friction`. Add `needs-decision` when fixing it needs the owner's call (a product choice, or anything on the hesitate list in [ADR 0003](../../../docs/adr/0003-agent-defaults-to-no.md)).
6. **Priority** (Linear's field):

   | Priority | Use when |
   | --- | --- |
   | Urgent | Broken for users, or blocking agents right now |
   | High | Costs real time on most PRs; fix this week |
   | Medium | Worth fixing when nothing higher is open |
   | Low | Nice to have; batch it with nearby work |

   Leave no issue without a priority.
7. **Keep secrets and user data out:** no tokens, `.env` contents, published context-pack CSV URLs, Discord user or guild IDs from production, or log lines that contain them.

## Linking

Put the issue ID (`FUR-123`) in the PR title and branch so Linear links the PR. Fixing a friction issue means the PR title starts `FUR-123:` and the PR body's Linear section names it.

## Working the open ones

The daily sweep, or anyone fixing friction by hand, follows this order:

1. Open issues with label `friction`, **without** `needs-decision` or `friction-skipped`.
2. Highest priority first (Urgent, High, Medium, Low, then no priority), oldest first within a priority.
3. Reproduce it. If it no longer reproduces, comment what you checked and close it.
4. Fix it in the smallest change that removes the cause (not the symptom), with a test when behavior changes. `npm run verify` must pass.
5. If you should not fix it, add `friction-skipped` and a short comment saying why. Add `needs-decision` too when the owner must choose.

`friction-skipped` means "someone looked and left it". The sweep ignores those issues until a person removes the label.
