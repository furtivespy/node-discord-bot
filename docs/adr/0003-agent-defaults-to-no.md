# 0003: Agents default to "no" on these changes

Status: accepted
Date: 2026-11-24

## Decision

Never:

- add a new paid service (hosted API, SaaS, paid tier) or a new recurring cost. Existing integrations (Gemini, Bugsnag, Fly.io) stay on their current tiers; do not add new paid vendors or upgrade paid plans unasked.
- log, print, commit, or leak secrets, tokens, API keys, or published context-pack CSV URLs (published Google Sheet URLs are secret capabilities; see `CONTEXT_PACKS.md` and `modules/contextPacks.js`).
- enable `QA_UNLOCK_ADMIN_COMMANDS` in production configs (`Dockerfile`, `fly.toml`, or deployed defaults).

Do the following only when the task or Linear issue explicitly asks for it. Without that, stop and ask:

- rename a slash command or change its options (a user-facing break);
- change Discord permissions (`defaultMemberPermissions`, `permLevel`, bot-owner checks) or gateway intents;
- change the Docker image layout, `fly.toml`, the `/data` volume, or where data is stored;
- change the release or tag workflow (`.github/workflows/release.yml`);
- change Node/npm major pins or move off npm 11;
- anything users would need explained or called out (release notes).

An explicit request in the task is the approval. A PR that does one of these is high risk and a human merges it (see [merge policy](../merge-policy.md)).

## Why

These changes break users, leak secret capabilities, cost money, or are hard to undo. Each one is easy for an agent to propose and expensive to reverse. Asking first is cheap.

## Revisit if

- one of these becomes routine and low risk (for example a release/deploy workflow fully covered by tests and health checks);
- the bot gains a budget for new paid services.
