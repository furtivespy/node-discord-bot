/**
 * `health`: inspect deployed status for Bender Bot.
 *
 * Bender Bot currently deploys manually to Fly.io (app `bender-bot`, ports = [])
 * and has no public HTTP `/health` endpoint yet.
 * - With `--origin <url>`: probes `<origin>/health` for JSON `{ sha }` (ready
 *   for when a Fly HTTP health check is added).
 * - Without `--origin`: checks `fly status --json -a bender-bot` if `flyctl` is
 *   installed and authenticated; otherwise reports clearly that automated deploy
 *   verification is not wired yet.
 */
import { execFileSync, spawnSync } from "node:child_process";

function deployedContains(deployed, expected) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", expected, deployed], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function readDeployedSha(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.sha === "string" ? body.sha : null;
  } catch {
    return null;
  }
}

async function checkHealth({ origin, expected, fetchImpl = fetch } = {}) {
  if (origin) {
    const url = `${String(origin).replace(/\/+$/, "")}/health`;
    const deployed = await readDeployedSha(url, fetchImpl);
    if (!expected) {
      return {
        ok: deployed !== null,
        mode: "http",
        url,
        deployed,
        outcome: deployed ? "reachable" : "unreachable",
      };
    }
    const match =
      deployed && deployed !== "unknown"
        ? deployed === expected
          ? "match"
          : deployedContains(deployed, expected)
            ? "newer"
            : "mismatch"
        : "unreachable";
    return {
      ok: match === "match" || match === "newer",
      mode: "http",
      url,
      deployed,
      expected,
      outcome: match,
    };
  }

  const fly = spawnSync("fly", ["status", "-a", "bender-bot", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (fly.status === 0 && fly.stdout) {
    try {
      const data = JSON.parse(fly.stdout);
      const machines = Array.isArray(data.Machines) ? data.Machines : [];
      const started = machines.filter((m) => m.state === "started").length;
      return {
        ok: started > 0 && !expected,
        mode: "fly",
        app: data.Name || "bender-bot",
        machinesTotal: machines.length,
        machinesStarted: started,
        outcome: expected
          ? "no-sha-check-yet"
          : started > 0
            ? "running"
            : "stopped",
        note: expected
          ? "Fly machine is queried, but SHA verification requires an HTTP /health endpoint (planned follow-up)."
          : undefined,
      };
    } catch {
      // fall through
    }
  }

  return {
    ok: !expected,
    mode: "manual",
    outcome: expected ? "unverified" : "manual-deploy",
    note:
      "Production deploys manually to Fly.io (bender-bot) with no HTTP /health endpoint yet. Confirm with `fly status -a bender-bot` and `/status` in Discord (see docs/runbooks/rollback.md).",
  };
}

function formatHealth(result) {
  if (result.mode === "http") {
    return `HTTP ${result.url}: outcome=${result.outcome} deployed=${result.deployed ?? "none"}${result.expected ? ` expected=${result.expected}` : ""}`;
  }
  if (result.mode === "fly") {
    const base = `Fly app ${result.app}: ${result.machinesStarted}/${result.machinesTotal} machine(s) started (${result.outcome})`;
    return result.note ? `${base}\n${result.note}` : base;
  }
  return result.note;
}

export { checkHealth, formatHealth, readDeployedSha };
