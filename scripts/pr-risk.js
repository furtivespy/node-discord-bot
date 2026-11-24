#!/usr/bin/env node
/**
 * Says whether a PR's changed files put it in the high-risk tier on their own.
 *
 * docs/merge-policy.md lists the high-risk paths. This is that list as code, so
 * the ship loop does not depend on an agent remembering it. It only finds
 * high risk from paths: slash-command contract changes, the `major` label, a
 * User call-out, and ADR 0003 items still need a person (or the agent) to judge.
 *
 * Usage:
 *   gh pr diff <n> --name-only | node scripts/pr-risk.js
 *   node scripts/pr-risk.js path/one.js path/two.js
 *   add --json for machine-readable output
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIGH_RISK_PATHS = [
  { prefix: "db/", why: "database code" },
  { prefix: "modules/enmap.js", why: "enmap storage layer" },
  { prefix: "scripts/migrate", why: "data migration script" },
  { prefix: "Dockerfile", why: "image build" },
  { prefix: "fly.toml", why: "Fly.io deployment config" },
  { prefix: ".github/workflows/", why: "CI and release workflows" },
  { prefix: ".github/ship-pr.json", why: "merge gate config" },
  { prefix: ".agents/skills/ship-pr/", why: "ship loop" },
  { prefix: "scripts/pr-risk.js", why: "risk tier check" },
  { prefix: "docs/merge-policy.md", why: "merge policy" },
  { prefix: "docs/adr/", why: "architecture decision records" },
];

function normalize(file) {
  return String(file).trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function highRiskFiles(files) {
  const hits = [];
  for (const raw of files) {
    const file = normalize(raw);
    if (!file) continue;
    const rule = HIGH_RISK_PATHS.find((r) => file.startsWith(r.prefix));
    if (rule) hits.push({ file, why: rule.why });
  }
  return hits;
}

function assess(files) {
  const hits = highRiskFiles(files);
  return { tier: hits.length ? "high" : null, files: hits };
}

function format(result) {
  if (!result.tier) {
    return "No high-risk paths. Judge low or medium from docs/merge-policy.md.";
  }
  return [
    "high: a human merges. These changed files are high risk by path:",
    ...result.files.map((f) => `  ${f.file} (${f.why})`),
  ].join("\n");
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main(argv = process.argv.slice(2), stdin = readStdin) {
  const json = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");
  const files = args.length ? args : (await stdin()).split(/\r?\n/);
  const result = assess(files);
  console.log(json ? JSON.stringify(result, null, 2) : format(result));
  return 0;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().then((code) => process.exit(code));
}

export { HIGH_RISK_PATHS, assess, format, highRiskFiles, main };
