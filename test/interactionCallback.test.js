import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import klaw from "klaw";
import { callbackMessage } from "../modules/interactionCallback.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "test", "data"]);
const DEPRECATED = /(?:ephemeral:\s*(?:true|false)|fetchReply\s*:|\.fetchReply\s*\()/;

function collectProductionJs() {
  return new Promise((resolve, reject) => {
    const files = [];
    klaw(ROOT)
      .on("data", (item) => {
        if (!item.path.endsWith(".js")) return;
        const rel = path.relative(ROOT, item.path);
        const parts = rel.split(path.sep);
        if (parts.some((part) => SKIP_DIRS.has(part))) return;
        files.push(item.path);
      })
      .on("end", () => resolve(files))
      .on("error", reject);
  });
}

describe("interaction callback helpers", () => {
  it("reads the message from InteractionCallbackResponse.resource.message", () => {
    const message = { id: "msg-1" };
    assert.equal(callbackMessage({ resource: { message } }), message);
  });

  it("returns a Message-like response as-is for tests and older mocks", () => {
    const message = { id: "msg-2", edit() {} };
    assert.equal(callbackMessage(message), message);
  });

  it("returns null when there is no response", () => {
    assert.equal(callbackMessage(null), null);
    assert.equal(callbackMessage(undefined), null);
  });
});

describe("discord.js interaction options", () => {
  it("does not pass deprecated ephemeral or fetchReply options", async () => {
    const hits = [];
    for (const file of await collectProductionJs()) {
      const rel = path.relative(ROOT, file);
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (DEPRECATED.test(line)) {
          hits.push(`${rel}:${index + 1}: ${trimmed}`);
        }
      });
    }
    assert.deepEqual(hits, []);
  });
});
