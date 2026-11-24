import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { check } from "../scripts/control/featureMap.js";

describe("docs/feature-map", () => {
  it("INDEX.md and notes.md match live slashcommands/", async () => {
    const problems = await check();
    assert.deepEqual(problems, []);
  });
});
