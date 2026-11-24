#!/usr/bin/env node
/**
 * control-bender: one entry point for an agent (or human) to verify a change.
 *
 *   npm run control -- doctor
 *   npm run control -- map [command] [--check | --write]
 *   npm run control -- execute <fixture.js> [--contains text]
 *   npm run control -- health [--origin url] [--sha commit]
 *
 * Add --json to any command for machine-readable output. Exit code 0 means the
 * command succeeded; 1 means a check failed; 2 means it was called wrong.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { formatDoctor, runDoctor } from "./control/doctor.js";
import { allText, formatSummary, runFixtureFile } from "./control/execute.js";
import { check, describeFeature, loadCommands, writeIndex } from "./control/featureMap.js";
import { checkHealth, formatHealth } from "./control/health.js";

const USAGE = `Usage: npm run control -- <command> [options] [--json]

Commands:
  doctor                      Check this machine can produce trustworthy results
  map [command]               Print the Feature Map (or one command's entry)
  map --check                 Fail when INDEX.md or notes.md drifted from the code
  map --write                 Regenerate docs/feature-map/INDEX.md
  execute <fixture.js>        Run a fixture through the real slash-command code
      --contains <text>       Fail unless a reply includes the text
  health                      Check Fly.io / optional HTTP /health status
      --origin <url>          Optional HTTP origin serving /health JSON
      --sha <commit>          Exit 1 unless that commit is running (or contained in it)
`;

class UsageError extends Error {}

function parse(argv) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      check: { type: "boolean" },
      write: { type: "boolean" },
      contains: { type: "string" },
      origin: { type: "string" },
      sha: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
}

const handlers = {
  async doctor() {
    const report = runDoctor();
    return { ok: report.ok, data: report, text: formatDoctor(report) };
  },

  async map({ values, positionals }) {
    if (values.write) {
      const file = await writeIndex();
      return { ok: true, data: { wrote: file }, text: `Wrote ${file}` };
    }
    if (values.check) {
      const problems = await check();
      return {
        ok: problems.length === 0,
        data: { problems },
        text: problems.length ? problems.map((p) => `- ${p}`).join("\n") : "Feature Map is in sync.",
      };
    }
    const name = positionals[1];
    if (name) {
      const text = await describeFeature(name);
      if (!text) {
        const known = (await loadCommands()).map((c) => c.name).join(", ");
        return {
          ok: false,
          data: { error: `No slash command "${name}"` },
          text: `No slash command "${name}". Known: ${known}`,
        };
      }
      return { ok: true, data: { command: name, text }, text };
    }
    const commands = await loadCommands();
    return {
      ok: true,
      data: { commands },
      text: commands.map((c) => `/${c.name}  ${c.description}`).join("\n"),
    };
  },

  async execute({ values, positionals }) {
    const file = positionals[1];
    if (!file) {
      throw new UsageError("execute needs a fixture file, e.g. scripts/control-fixtures/ping.js");
    }
    const { results, returned } = await runFixtureFile(file);
    const problems = [];
    for (const result of results) {
      for (const entry of result.logged) {
        problems.push(`${result.command} logged ${entry.level}: ${entry.message.split("\n")[0]}`);
      }
    }
    if (values.contains && !allText(results).includes(values.contains)) {
      problems.push(`No reply contained ${JSON.stringify(values.contains)}`);
    }
    const text = [
      ...results.map(formatSummary),
      returned === undefined ? null : `fixture returned: ${JSON.stringify(returned)}`,
      problems.length ? `\nPROBLEMS\n${problems.map((p) => `- ${p}`).join("\n")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      ok: problems.length === 0,
      data: { results, returned, problems },
      text,
    };
  },

  async health({ values }) {
    const result = await checkHealth({ origin: values.origin, expected: values.sha });
    return { ok: result.ok, data: result, text: formatHealth(result) };
  },
};

async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    return 2;
  }

  const { values, positionals } = parsed;
  const cmd = positionals[0];
  if (values.help || !cmd) {
    console.log(USAGE);
    return cmd ? 0 : 2;
  }

  const handler = handlers[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}\n`);
    console.error(USAGE);
    return 2;
  }

  try {
    const result = await handler({ values, positionals });
    if (values.json) {
      console.log(JSON.stringify({ ok: result.ok, ...result.data }, null, 2));
    } else if (result.text) {
      console.log(result.text);
    }
    return result.ok ? 0 : 1;
  } catch (err) {
    const code = err instanceof UsageError ? 2 : 1;
    if (values.json) {
      console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
    } else {
      console.error(err.stack || err.message);
    }
    return code;
  }
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().then((code) => process.exit(code));
}

export { main };
