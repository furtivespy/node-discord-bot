import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assess, format, highRiskFiles } from "../scripts/pr-risk.js";

describe("scripts/pr-risk.js", () => {
  it("flags high-risk infrastructure, storage, and merge-gate paths", () => {
    const files = [
      "db/db.js",
      "modules/enmap.js",
      "Dockerfile",
      "fly.toml",
      ".github/workflows/test.yml",
      ".github/ship-pr.json",
      ".agents/skills/ship-pr/SKILL.md",
      "scripts/pr-risk.js",
      "docs/merge-policy.md",
      "docs/adr/0003-agent-defaults-to-no.md",
      "scripts/migrate-foo.js",
    ];
    const result = assess(files);
    assert.equal(result.tier, "high");
    assert.equal(result.files.length, files.length);
  });

  it("normalizes Windows backslashes and leading ./", () => {
    const hits = highRiskFiles([".\\db\\db.js", "./fly.toml"]);
    assert.deepEqual(
      hits.map((h) => h.file),
      ["db/db.js", "fly.toml"]
    );
  });

  it("returns null tier for ordinary command, module, and test edits", () => {
    const result = assess([
      "slashcommands/fun/example.js",
      "modules/example.js",
      "test/example.test.js",
      "README.md",
    ]);
    assert.equal(result.tier, null);
    assert.deepEqual(result.files, []);
    assert.match(format(result), /No high-risk paths/);
  });
});
