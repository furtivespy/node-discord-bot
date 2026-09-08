# Furtivespy's discord.js bot

This discord.js bot has some heavy influence from [An Idiots Guide bot](https://github.com/AnIdiotsGuide/guidebot). 

## Introduction

This project is a bot I created for a discord chat with friends and to better learn node

# What this bot does? 

Check out the commands folder for a list of commands

## Dependency updates

Dependabot version updates live in [`.github/dependabot.yml`](.github/dependabot.yml). Once that file is on `master` **and** Dependabot is enabled in GitHub, weekly PRs show up from the `dependabot` bot:

- **npm** at the repo root (`package.json` / `package-lock.json`): patch and minor bumps are grouped into one PR; major bumps stay as individual PRs
- **GitHub Actions** in `.github/workflows`: same grouping

There are no ignore rules or private-registry secrets in the config, so updates are not silently disabled.

**After merge, a repo admin (Will) must confirm in GitHub:** Settings → Advanced Security → Dependabot — enable **version updates** (this config does nothing until that toggle is on). Alerts and security updates are separate and recommended. Then check the **Insights → Dependency graph → Dependabot** tab (or the first weekly PRs) for a successful run or a clear “no updates” state.

This repo’s release workflow tags merges that carry a `major` / `minor` / `patch` label. Dependabot may apply those SemVer labels automatically. Remove the label before merge if you do not want a release tag.


