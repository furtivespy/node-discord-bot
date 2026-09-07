const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  PACK_KINDS,
  MAX_PACKS_PER_GUILD,
  redactUrl,
  scrubErrorMessage,
  validateContextUrl,
  validatePackName,
  normalizePack,
  listGuildPacks,
  upsertGuildPack,
  removeGuildPack,
  packNeedsFetch,
  selectPacksForTurn,
  recentUserText,
  selectRelevantCsv,
  formatPackBlock,
  attachPacksToContents,
  contextPackSystemNote,
  createContextPackService,
} = require("../modules/contextPacks");

const PLAYS_CSV = [
  "Date,Game,Players,Winner",
  "2026-01-04,Azul,Shane/Will,Shane",
  "2026-01-11,Catan,Shane/Will/Alex,Will",
  "2026-02-02,Wingspan,Alex/Will,Alex",
].join("\n");

const SECRET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vThisIsASecretToken/pub?gid=0&single=true&output=csv";

function mockResponse({ ok = true, status = 200, text = PLAYS_CSV, headers = {} } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? headers[name] ?? null;
      },
    },
    async text() {
      return text;
    },
  };
}

describe("context pack URL secrecy", () => {
  it("redacts path and query so a published CSV token is not logged", () => {
    const redacted = redactUrl(SECRET_URL);
    assert.equal(redacted, "https://docs.google.com/…");
    assert.doesNotMatch(redacted, /2PACX/);
    assert.doesNotMatch(redacted, /SecretToken/);
    assert.doesNotMatch(redacted, /pub/);
  });

  it("scrubs the full URL out of fetch error messages", () => {
    const error = new Error(`request to ${SECRET_URL} failed`);
    const scrubbed = scrubErrorMessage(error, SECRET_URL);
    assert.doesNotMatch(scrubbed, /2PACX/);
    assert.match(scrubbed, /docs\.google\.com\/…/);
  });
});

describe("validateContextUrl", () => {
  it("accepts https published CSV URLs", () => {
    assert.equal(validateContextUrl(SECRET_URL).url, SECRET_URL);
    assert.equal(
      validateContextUrl("https://my-bucket.s3.amazonaws.com/plays.csv").url,
      "https://my-bucket.s3.amazonaws.com/plays.csv"
    );
  });

  it("rejects http, credentials, and local/private hosts", () => {
    assert.match(validateContextUrl("http://example.com/plays.csv").error, /https/);
    assert.match(validateContextUrl("https://user:pass@example.com/plays.csv").error, /username/);
    assert.match(validateContextUrl("https://localhost/plays.csv").error, /not allowed/);
    assert.match(validateContextUrl("https://127.0.0.1/plays.csv").error, /not allowed/);
    assert.match(validateContextUrl("https://192.168.1.9/plays.csv").error, /not allowed/);
    assert.match(validateContextUrl("https://10.0.0.5/plays.csv").error, /not allowed/);
    assert.match(validateContextUrl("file:///tmp/plays.csv").error, /https/);
  });
});

describe("guild pack settings", () => {
  it("normalizes name/kind and upserts by name", () => {
    const first = upsertGuildPack([], { name: "Plays", url: SECRET_URL });
    assert.equal(first.pack.name, "plays");
    assert.equal(first.pack.kind, "plays");
    assert.equal(first.replaced, false);

    const second = upsertGuildPack(first.packs, {
      name: "plays",
      kind: "plays",
      url: "https://example.com/other.csv",
    });
    assert.equal(second.replaced, true);
    assert.equal(second.packs.length, 1);
    assert.equal(second.pack.url, "https://example.com/other.csv");
  });

  it("lists only well-shaped packs from guild settings", () => {
    assert.deepEqual(listGuildPacks({}), []);
    assert.deepEqual(
      listGuildPacks({
        context_packs: [
          { name: "plays", kind: "plays", url: SECRET_URL },
          { name: "bad" },
          "nope",
        ],
      }),
      [{ name: "plays", kind: "plays", url: SECRET_URL }]
    );
  });

  it("caps how many packs a guild can store", () => {
    let packs = [];
    for (let i = 0; i < MAX_PACKS_PER_GUILD; i++) {
      const result = upsertGuildPack(packs, {
        name: `pack${i}`,
        kind: "general",
        url: `https://example.com/${i}.csv`,
      });
      assert.ok(!result.error, result.error);
      packs = result.packs;
    }
    const extra = upsertGuildPack(packs, {
      name: "overflow",
      kind: "general",
      url: "https://example.com/overflow.csv",
    });
    assert.match(extra.error, /already has/);
  });

  it("removes a pack by name", () => {
    const added = upsertGuildPack([], { name: "plays", url: SECRET_URL });
    const removed = removeGuildPack(added.packs, "plays");
    assert.deepEqual(removed.packs, []);
    assert.match(removeGuildPack([], "plays").error, /No context pack/);
  });

  it("rejects invalid pack names", () => {
    assert.match(validatePackName("").error, /empty/);
    assert.match(validatePackName("1plays").error, /start with a letter/);
    assert.equal(PACK_KINDS.includes("plays"), true);
    assert.match(normalizePack({ name: "plays", kind: "sheets", url: SECRET_URL }).error, /Kind/);
  });
});

describe("games/stats heuristic", () => {
  const plays = { name: "plays", kind: "plays", url: SECRET_URL };
  const notes = { name: "house-rules", kind: "general", url: "https://example.com/rules.csv" };

  it("attaches plays packs for games/stats questions, not ordinary chat", () => {
    assert.equal(packNeedsFetch(plays, "Who has the most wins in Catan?"), true);
    assert.equal(packNeedsFetch(plays, "have we played Azul yet?"), true);
    assert.equal(packNeedsFetch(plays, "game night stats please"), true);
    assert.equal(packNeedsFetch(plays, "high"), false);
    assert.equal(packNeedsFetch(plays, "how's it going"), false);
    assert.equal(packNeedsFetch(plays, "nice, same"), false);
  });

  it("attaches general packs for notes questions or when the pack name is mentioned", () => {
    assert.equal(packNeedsFetch(notes, "what are our house rules?"), true);
    assert.equal(packNeedsFetch(notes, "check the house-rules pack"), true);
    assert.equal(packNeedsFetch(notes, "who won Catan?"), false);
  });

  it("selects only matching packs for the turn", () => {
    const selected = selectPacksForTurn([plays, notes], "Who won the most games?");
    assert.deepEqual(
      selected.map((pack) => pack.name),
      ["plays"]
    );
  });
});

describe("prompt attachment", () => {
  it("clones the last user turn instead of mutating contents", () => {
    const contents = [
      { role: "user", parts: [{ text: "hello" }] },
      { role: "model", parts: [{ text: "hi" }] },
      { role: "user", parts: [{ text: "Who won Azul?" }] },
    ];
    const next = attachPacksToContents(contents, "PACK");
    assert.equal(contents[2].parts[0].text, "Who won Azul?");
    assert.match(next[2].parts[0].text, /Who won Azul\?\n\nPACK/);
    assert.equal(next[0].parts[0].text, "hello");
  });

  it("formats CSV as ordinary prompt text, not a grounding tool", () => {
    const block = formatPackBlock({ name: "plays", kind: "plays" }, PLAYS_CSV, "Who won Azul?");
    assert.match(block, /play tracker/);
    assert.match(block, /not instructions/);
    assert.match(block, /Prefer this table over Google Search/);
    assert.match(block, /```csv/);
    assert.match(block, /Azul/);
    const note = contextPackSystemNote([{ name: "plays" }]);
    assert.match(note, /not a grounding tool/);
    assert.match(note, /google_search/);
  });

  it("truncates a large sheet to rows that match the question", () => {
    const rows = ["Game,Winner"];
    for (let i = 0; i < 200; i++) rows.push(`Filler${i},Nobody`);
    rows.push("Azul,Shane");
    const selected = selectRelevantCsv(rows.join("\n"), "Who won Azul?", 400);
    assert.equal(selected.truncated, true);
    assert.match(selected.text, /Azul,Shane/);
    assert.ok(selected.text.length <= 400);
  });

  it("reads recent user text from the triggering message and last turns", () => {
    const text = recentUserText(
      [{ role: "user", parts: [{ text: "older" }] }],
      { content: "Who won Catan?" }
    );
    assert.match(text, /Who won Catan/);
    assert.match(text, /older/);
  });
});

describe("fetch + cache", () => {
  it("fetches once inside the TTL and attaches CSV on a games question", async () => {
    let calls = 0;
    const fetch = async (url) => {
      calls += 1;
      assert.equal(url, SECRET_URL);
      return mockResponse();
    };
    let current = 1_000;
    const service = createContextPackService({
      fetch,
      now: () => current,
      ttlMs: 10 * 60 * 1000,
      logger: { log() {} },
    });
    const message = {
      content: "Who has the most wins?",
      settings: { context_packs: [{ name: "plays", kind: "plays", url: SECRET_URL }] },
    };
    const contents = [{ role: "user", parts: [{ text: "Who has the most wins?" }] }];

    const first = await service.attachIfNeeded(contents, message);
    const second = await service.attachIfNeeded(contents, message);
    assert.equal(calls, 1);
    assert.equal(first.attached[0].name, "plays");
    assert.match(first.contents[0].parts[0].text, /Azul,Shane\/Will,Shane/);
    assert.equal(first.contents[0].parts[0].text.includes(SECRET_URL), false);
    assert.equal(second.attached[0].name, "plays");
    assert.match(first.note, /ordinary prompt text/);
  });

  it("does not fetch on ordinary chat even when a pack is configured", async () => {
    let calls = 0;
    const service = createContextPackService({
      fetch: async () => {
        calls += 1;
        return mockResponse();
      },
      logger: { log() {} },
    });
    const result = await service.attachIfNeeded(
      [{ role: "user", parts: [{ text: "high five" }] }],
      {
        content: "high five",
        settings: { context_packs: [{ name: "plays", kind: "plays", url: SECRET_URL }] },
      }
    );
    assert.equal(calls, 0);
    assert.deepEqual(result.attached, []);
    assert.equal(result.contents[0].parts[0].text, "high five");
  });

  it("refetches after TTL and can serve stale data if the live fetch fails", async () => {
    let calls = 0;
    let current = 0;
    const fetch = async () => {
      calls += 1;
      if (calls === 1) return mockResponse();
      throw new Error(`request to ${SECRET_URL} failed`);
    };
    const logs = [];
    const service = createContextPackService({
      fetch,
      now: () => current,
      ttlMs: 10 * 60 * 1000,
      logger: {
        log(content) {
          logs.push(String(content));
        },
      },
    });
    const message = {
      content: "who won Azul?",
      settings: { context_packs: [{ name: "plays", kind: "plays", url: SECRET_URL }] },
    };
    const contents = [{ role: "user", parts: [{ text: "who won Azul?" }] }];

    await service.attachIfNeeded(contents, message);
    current = 11 * 60 * 1000;
    const stale = await service.attachIfNeeded(contents, message);
    assert.equal(calls, 2);
    assert.equal(stale.attached[0].stale, true);
    assert.match(stale.contents[0].parts[0].text, /Azul/);
    assert.ok(logs.every((line) => !line.includes("2PACX")));
    assert.ok(logs.some((line) => line.includes("docs.google.com/…")));
  });

  it("skips HTML bodies so a login page is not injected", async () => {
    const service = createContextPackService({
      fetch: async () => mockResponse({ text: "<!DOCTYPE html><html>login</html>" }),
      logger: { log() {} },
    });
    const result = await service.attachIfNeeded(
      [{ role: "user", parts: [{ text: "who won Catan?" }] }],
      {
        content: "who won Catan?",
        settings: { context_packs: [{ name: "plays", kind: "plays", url: SECRET_URL }] },
      }
    );
    assert.deepEqual(result.attached, []);
    assert.equal(result.contents[0].parts[0].text, "who won Catan?");
  });
});
