/**
 * `doctor`: is this machine set up so verification results can be trusted?
 *
 * Each check returns { name, status: "ok" | "warn" | "error", detail, fix }.
 * Only errors fail the command; warnings are things that can drift from CI.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const ok = (name, detail) => ({ name, status: "ok", detail });
const warn = (name, detail, fix) => ({ name, status: "warn", detail, fix });
const error = (name, detail, fix) => ({ name, status: "error", detail, fix });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseSemver(v) {
  const match = String(v).trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function satisfiesSimpleRange(installedStr, rangeStr) {
  const installed = parseSemver(installedStr);
  if (!installed) return true;
  const trimmed = String(rangeStr).trim();
  if (/^\d+\.\d+\.\d+$/.test(trimmed)) {
    return compareSemver(installed, parseSemver(trimmed)) === 0;
  }
  if (trimmed.startsWith("^")) {
    const min = parseSemver(trimmed.slice(1));
    if (!min) return true;
    const upper = min[0] > 0 ? [min[0] + 1, 0, 0] : min[1] > 0 ? [0, min[1] + 1, 0] : [0, 0, min[2] + 1];
    return compareSemver(installed, min) >= 0 && compareSemver(installed, upper) < 0;
  }
  if (trimmed.startsWith("~")) {
    const min = parseSemver(trimmed.slice(1));
    if (!min) return true;
    const upper = [min[0], min[1] + 1, 0];
    return compareSemver(installed, min) >= 0 && compareSemver(installed, upper) < 0;
  }
  return true;
}

function checkNodeVersion(root = ROOT, current = process.version) {
  const nvmrcPath = path.join(root, ".nvmrc");
  if (!fs.existsSync(nvmrcPath)) return ok("node", `Node ${current} (no .nvmrc pin)`);
  const pinned = fs.readFileSync(nvmrcPath, "utf8").trim().replace(/^v/, "");
  const actual = String(current).replace(/^v/, "");
  if (pinned === actual) return ok("node", `Node v${actual} matches .nvmrc pin`);
  return warn(
    "node",
    `Node v${actual} but .nvmrc pins v${pinned}. CI and Dockerfile require v${pinned}.`,
    `Install and use Node ${pinned} (e.g. nvm install ${pinned} && nvm use ${pinned})`
  );
}

function checkNpmVersion(pkg) {
  const pinned = String(pkg.packageManager || "").match(/^npm@(.+)$/)?.[1];
  const result = spawnSync("npm", ["-v"], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) {
    return error("npm", "npm is not on PATH", `Install npm ${pinned || "11.20.0"}`);
  }
  const actual = (result.stdout || "").trim();
  if (!pinned || actual === pinned) return ok("npm", `npm ${actual}${pinned ? " matches packageManager pin" : ""}`);
  return warn(
    "npm",
    `npm ${actual} but package.json pins ${pinned}. CI asserts ${pinned}.`,
    `npm install -g npm@${pinned}`
  );
}

function checkDependencies(pkg, root = ROOT) {
  const problems = [];
  const wanted = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, range] of Object.entries(wanted)) {
    if (!/^[~^\d]/.test(range)) continue;
    const manifest = path.join(root, "node_modules", name, "package.json");
    if (!fs.existsSync(manifest)) {
      problems.push(`${name} is not installed`);
      continue;
    }
    const installed = readJson(manifest).version;
    if (!satisfiesSimpleRange(installed, range)) {
      problems.push(`${name} ${installed} does not satisfy ${range}`);
    }
  }
  if (problems.length === 0) return ok("dependencies", "node_modules satisfies package.json");
  return error(
    "dependencies",
    `${problems.length} out of date: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "; ..." : ""}`,
    "npm ci"
  );
}

function checkHooks(root = ROOT) {
  const result = spawnSync("git", ["config", "core.hooksPath"], { cwd: root, encoding: "utf8" });
  const value = (result.stdout || "").trim();
  if (value === ".githooks") return ok("git hooks", "pre-push lint hook is installed");
  return warn("git hooks", "pre-push lint hook is not installed", "npm run hooks:install");
}

function checkOpenssl() {
  const result = spawnSync("openssl", ["version"], { encoding: "utf8" });
  if (result.status === 0) {
    return ok("openssl", (result.stdout || "").trim());
  }
  return warn(
    "openssl",
    "openssl is not on PATH (test/contextPacks.test.js local-HTTPS tests require it)",
    "Install openssl or add Git's usr/bin directory to PATH"
  );
}

function checkEnvFile(root = ROOT) {
  if (!fs.existsSync(path.join(root, ".env"))) return ok(".env", "no local .env");
  return ok(".env", "local .env present (not loaded automatically by Node unless passed --env-file)");
}

function runDoctor(root = ROOT) {
  const pkg = readJson(path.join(root, "package.json"));
  const checks = [
    checkNodeVersion(root),
    checkNpmVersion(pkg),
    checkDependencies(pkg, root),
    checkHooks(root),
    checkOpenssl(),
    checkEnvFile(root),
  ];
  return { ok: checks.every((c) => c.status !== "error"), checks };
}

function formatDoctor(report) {
  const marks = { ok: "ok   ", warn: "WARN ", error: "FAIL " };
  const lines = [];
  for (const check of report.checks) {
    lines.push(`${marks[check.status]} ${check.name}: ${check.detail}`);
    if (check.fix) lines.push(`       fix: ${check.fix}`);
  }
  return lines.join("\n");
}

export {
  checkDependencies,
  checkHooks,
  checkNodeVersion,
  checkNpmVersion,
  checkOpenssl,
  formatDoctor,
  runDoctor,
  satisfiesSimpleRange,
};
