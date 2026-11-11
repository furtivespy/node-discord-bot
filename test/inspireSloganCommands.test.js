import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import Inspire, {
  INSPIRE_UNAVAILABLE,
  INSPIRE_URL,
} from "../slashcommands/fun/inspire.js";
import Slogan, {
  SLOGAN_UNAVAILABLE,
  sloganUrl,
} from "../slashcommands/fun/slogan.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockClient() {
  const logs = [];
  return {
    logs,
    logger: {
      log(msg, level) {
        logs.push({ msg, level });
      },
    },
  };
}

function mockInteraction({ item } = {}) {
  const replies = [];
  return {
    replies,
    deferred: false,
    options: {
      getString(name) {
        return name === "item" ? item : null;
      },
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply(payload) {
      const content = typeof payload === "string" ? payload : payload?.content;
      if (content === "") {
        throw new Error("DiscordAPIError[50006] Cannot send an empty message");
      }
      const reply = typeof payload === "string" ? { content: payload } : payload;
      replies.push(reply);
      return reply;
    },
  };
}

function textResponse(body, { ok = true, status = ok ? 200 : 500 } = {}) {
  return {
    ok,
    status,
    async text() {
      return body;
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

describe("/inspire", () => {
  it("posts an embed when inspirobot returns an image URL over https", async () => {
    const imageUrl = "https://generated.inspirobot.me/a/example.jpg";
    const calls = stubFetch(() => textResponse(imageUrl));
    const cmd = new Inspire(mockClient());
    const interaction = mockInteraction();

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.equal(calls[0].url, INSPIRE_URL);
    assert.match(INSPIRE_URL, /^https:\/\//);
    const reply = interaction.replies.at(-1);
    assert.equal(reply.embeds.length, 1);
    assert.equal(reply.embeds[0].data.image.url, imageUrl);
    assert.equal(reply.content, undefined);
  });

  it("edits in an error when the upstream returns 500 with an empty body", async () => {
    stubFetch(() => textResponse("", { ok: false, status: 500 }));
    const cmd = new Inspire(mockClient());
    const interaction = mockInteraction();

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.deepEqual(interaction.replies.at(-1), { content: INSPIRE_UNAVAILABLE });
  });

  it("edits in an error when the upstream returns an empty 200 body", async () => {
    stubFetch(() => textResponse(""));
    const cmd = new Inspire(mockClient());
    const interaction = mockInteraction();

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.deepEqual(interaction.replies.at(-1), { content: INSPIRE_UNAVAILABLE });
  });

  it("edits in an error when fetch itself rejects", async () => {
    const client = mockClient();
    stubFetch(() => {
      throw new Error("ECONNRESET");
    });
    const cmd = new Inspire(client);
    const interaction = mockInteraction();

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.deepEqual(interaction.replies.at(-1), { content: INSPIRE_UNAVAILABLE });
    assert.equal(client.logs[0].level, "error");
  });
});

describe("/slogan", () => {
  it("strips HTML and replies with the slogan text", async () => {
    const calls = stubFetch(() =>
      textResponse('<a href="http://www.sloganizer.net">Pizza: eat more pie</a>')
    );
    const cmd = new Slogan(mockClient());
    const interaction = mockInteraction({ item: "pizza" });

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.equal(calls[0].url, sloganUrl("pizza"));
    assert.deepEqual(interaction.replies.at(-1), { content: "Pizza: eat more pie" });
  });

  it("edits in an error when the upstream returns 500 with an empty body", async () => {
    stubFetch(() => textResponse("", { ok: false, status: 500 }));
    const cmd = new Slogan(mockClient());
    const interaction = mockInteraction({ item: "pizza" });

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.deepEqual(interaction.replies.at(-1), { content: SLOGAN_UNAVAILABLE });
  });

  it("edits in an error instead of sending an empty message", async () => {
    stubFetch(() => textResponse("<html></html>"));
    const cmd = new Slogan(mockClient());
    const interaction = mockInteraction({ item: "pizza" });

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.deepEqual(interaction.replies.at(-1), { content: SLOGAN_UNAVAILABLE });
  });

  it("edits in an error when fetch itself rejects", async () => {
    const client = mockClient();
    stubFetch(() => {
      throw new Error("ECONNRESET");
    });
    const cmd = new Slogan(client);
    const interaction = mockInteraction({ item: "pizza" });

    await cmd.execute(interaction);

    assert.equal(interaction.deferred, true);
    assert.deepEqual(interaction.replies.at(-1), { content: SLOGAN_UNAVAILABLE });
    assert.equal(client.logs[0].level, "error");
  });
});
