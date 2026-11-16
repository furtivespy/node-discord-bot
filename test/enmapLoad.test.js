import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Enmap from "../modules/enmap.js";

const require = createRequire(import.meta.url);

describe("Enmap + better-sqlite3 (FUR-210)", () => {
  it("still does not export better-sqlite3/lib/database, so the Module._load patch stays required", () => {
    assert.throws(
      () => require("better-sqlite3/lib/database"),
      (err) => err.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
    );
  });

  it("loads a persistent store, round-trips a value, and uses SQLite 3.54.1", () => {
    const dir = mkdtempSync(join(tmpdir(), "enmap-fur210-"));
    const store = new Enmap({
      name: "settings",
      cloneLevel: "deep",
      fetchAll: false,
      autoFetch: true,
      dataDir: dir,
    });
    try {
      store.set("guild-1", { prefix: "!" });
      assert.deepEqual(store.get("guild-1"), { prefix: "!" });
      assert.equal(store.db.prepare("select sqlite_version() as v").get().v, "3.54.1");
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
