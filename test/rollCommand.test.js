import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import SlashCommand from "../base/SlashCommand.js";
import Roll from "../slashcommands/games/roll.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockClient(config = {}) {
  const logs = [];
  return {
    logs,
    config: {
      google_key: "",
      google_cxid: "",
      ...config,
    },
    logger: {
      log(content, type = "log") {
        logs.push({ content, type });
      },
    },
  };
}

function mockInteraction({ dice = "d20" } = {}) {
  const replies = [];
  return {
    replies,
    deferred: false,
    options: {
      getString(name) {
        return name === "dice" ? dice : null;
      },
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply(payload) {
      replies.push(payload);
      return payload;
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    },
  };
}

function stubFetch(impl) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return impl(calls[calls.length - 1]);
  };
  return calls;
}

function cseResponse(items) {
  return {
    async json() {
      return items === undefined ? {} : { items };
    },
  };
}

describe("getRandomGoogleImg", () => {
  it("returns undefined without fetching when google_key is empty", async () => {
    const calls = stubFetch(() => {
      throw new Error("CSE should not be called when unconfigured");
    });
    const cmd = new SlashCommand(mockClient({ google_key: "", google_cxid: "cx" }), {
      name: "test",
    });

    const img = await cmd.getRandomGoogleImg("number 7", false, true);

    assert.equal(img, undefined);
    assert.equal(calls.length, 0);
  });

  it("returns undefined when CSE JSON has no items", async () => {
    const calls = stubFetch(() => cseResponse(undefined));
    const cmd = new SlashCommand(
      mockClient({ google_key: "key", google_cxid: "cx" }),
      { name: "test" }
    );

    const img = await cmd.getRandomGoogleImg("number 7", false, true);

    assert.equal(img, undefined);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /googleapis\.com\/customsearch\/v1/);
  });

  it("returns a result when CSE has items", async () => {
    stubFetch(() => cseResponse([{ link: "https://example.test/7.png" }]));
    const cmd = new SlashCommand(
      mockClient({ google_key: "key", google_cxid: "cx" }),
      { name: "test" }
    );

    const img = await cmd.getRandomGoogleImg("number 7", false, true);

    assert.equal(img.link, "https://example.test/7.png");
  });
});

describe("/roll optional CSE thumbnail", () => {
  it("replies with the roll and no TypeError when google_key is empty", async () => {
    const calls = stubFetch(() => {
      throw new Error("CSE should not be called when unconfigured");
    });
    const client = mockClient({ google_key: "", google_cxid: "cx" });
    const interaction = mockInteraction({ dice: "d20" });

    await new Roll(client).execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.equal(interaction.replies.length, 1);
    const embed = interaction.replies[0].embeds[0];
    assert.match(embed.description, /Total rolled: \*\*\d+\*\*/);
    assert.equal(embed.thumbnail, undefined);
    assert.equal(client.logs.length, 0);
    assert.equal(calls.length, 0);
  });

  it("skips the thumbnail quietly when CSE returns no items", async () => {
    stubFetch(() => cseResponse(undefined));
    const client = mockClient({ google_key: "key", google_cxid: "cx" });
    const interaction = mockInteraction({ dice: "1d6" });

    await new Roll(client).execute(interaction);

    const embed = interaction.replies[0].embeds[0];
    assert.match(embed.description, /Total rolled: \*\*\d+\*\*/);
    assert.equal(embed.thumbnail, undefined);
    assert.equal(client.logs.length, 0);
  });

  it("attaches the thumbnail when CSE returns an image", async () => {
    stubFetch(() => cseResponse([{ link: "https://example.test/roll.png" }]));
    const client = mockClient({ google_key: "key", google_cxid: "cx" });
    const interaction = mockInteraction({ dice: "1d4" });

    await new Roll(client).execute(interaction);

    const embed = interaction.replies[0].embeds[0];
    assert.match(embed.description, /Total rolled: \*\*\d+\*\*/);
    assert.deepEqual(embed.thumbnail, { url: "https://example.test/roll.png" });
    assert.equal(client.logs.length, 0);
  });
});
