import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import Drink, {
  dismissTimedOutReply,
  isCollectorEnd,
  isCollectorTimeout,
  isUnknownMessage,
} from "../slashcommands/fun/drink.js";

function collectorError(reason) {
  const error = new Error(`Collector received no interactions before ending with reason: ${reason}`);
  error.code = "InteractionCollectorError";
  error.name = "InteractionCollectorError";
  return error;
}

function unknownMessageError() {
  const error = new Error("Unknown Message");
  error.code = 10008;
  error.name = "DiscordAPIError";
  return error;
}

function drink(name, extras = {}) {
  return {
    strDrink: name,
    strDrinkThumb: `https://example.test/${name}.png`,
    strInstructions: `Make ${name}`,
    strIngredient1: "Tequila",
    strMeasure1: "2 oz",
    ...extras,
  };
}

function mockClient() {
  const logs = [];
  return {
    logs,
    logger: {
      log(content, type = "log") {
        logs.push({ content, type });
      },
    },
  };
}

function mockInteraction({
  search = "margarita",
  awaitComponent,
  editReplyImpl,
} = {}) {
  const replies = [];
  const followUps = [];
  const edits = [];
  const updates = [];
  return {
    replies,
    followUps,
    edits,
    updates,
    options: {
      getString(name) {
        return name === "search" ? search : null;
      },
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    },
    async editReply(payload) {
      if (editReplyImpl) return editReplyImpl(payload);
      edits.push(payload);
      return payload;
    },
    async followUp(payload) {
      followUps.push(payload);
      return payload;
    },
    async awaitMessageComponent() {
      if (typeof awaitComponent === "function") return awaitComponent();
      throw new Error("awaitMessageComponent not stubbed");
    },
  };
}

describe("drink collector error helpers", () => {
  it("treats InteractionCollectorError with reason time as a timeout", () => {
    const error = collectorError("time");
    assert.equal(isCollectorEnd(error), true);
    assert.equal(isCollectorTimeout(error), true);
    assert.equal(isUnknownMessage(error), false);
  });

  it("treats InteractionCollectorError with reason messageDelete as a collector end, not a timeout", () => {
    const error = collectorError("messageDelete");
    assert.equal(isCollectorEnd(error), true);
    assert.equal(isCollectorTimeout(error), false);
  });

  it("recognizes DiscordAPIError 10008 Unknown Message", () => {
    const error = unknownMessageError();
    assert.equal(isUnknownMessage(error), true);
    assert.equal(isCollectorEnd(error), false);
  });

  it("dismisses a timed-out reply by clearing components", async () => {
    const interaction = mockInteraction();
    await dismissTimedOutReply(interaction);
    assert.deepEqual(interaction.edits, [{ content: "Timed out", components: [] }]);
  });

  it("swallows DiscordAPIError 10008 when the reply was already deleted", async () => {
    const interaction = mockInteraction({
      editReplyImpl: async () => {
        throw unknownMessageError();
      },
    });
    await assert.doesNotReject(() => dismissTimedOutReply(interaction));
  });

  it("rethrows unexpected dismiss errors", async () => {
    const boom = new Error("rate limited");
    boom.code = 429;
    const interaction = mockInteraction({
      editReplyImpl: async () => {
        throw boom;
      },
    });
    await assert.rejects(() => dismissTimedOutReply(interaction), boom);
  });
});

describe("Drink execute collector paths", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubDrinks(drinks) {
    globalThis.fetch = async () => ({
      json: async () => ({ drinks }),
    });
  }

  it("does not log collector timeout as an error and clears the select menu", async () => {
    stubDrinks([drink("Margarita"), drink("Blue Margarita")]);
    const client = mockClient();
    const interaction = mockInteraction({
      awaitComponent: async () => {
        throw collectorError("time");
      },
    });
    const cmd = new Drink(client);
    await cmd.execute(interaction);

    assert.equal(client.logs.length, 0);
    assert.equal(interaction.followUps.length, 0);
    assert.equal(interaction.replies.length, 1);
    assert.match(interaction.replies[0].content, /Multiple results/);
    assert.equal(interaction.replies[0].ephemeral, true);
    assert.equal(interaction.edits.length, 1);
    assert.deepEqual(interaction.edits[0], { content: "Timed out", components: [] });
  });

  it("handles a deleted ephemeral reply (10008) without an unhandled error", async () => {
    stubDrinks([drink("Margarita"), drink("Blue Margarita")]);
    const client = mockClient();
    const interaction = mockInteraction({
      awaitComponent: async () => {
        throw collectorError("messageDelete");
      },
      editReplyImpl: async () => {
        throw unknownMessageError();
      },
    });
    const cmd = new Drink(client);
    await assert.doesNotReject(() => cmd.execute(interaction));
    assert.equal(client.logs.length, 0);
    assert.equal(interaction.followUps.length, 0);
  });

  it("sends the selected drink after a menu choice", async () => {
    stubDrinks([drink("Margarita"), drink("Blue Margarita")]);
    const client = mockClient();
    const updates = [];
    const interaction = mockInteraction({
      awaitComponent: async () => ({
        values: ["1"],
        async update(payload) {
          updates.push(payload);
        },
      }),
    });
    const cmd = new Drink(client);
    await cmd.execute(interaction);

    assert.equal(client.logs.length, 0);
    assert.deepEqual(updates[0], { content: "Blue Margarita", components: [] });
    assert.equal(interaction.followUps.length, 1);
    const embed = interaction.followUps[0].embeds[0];
    assert.equal(embed.data.title, "Blue Margarita");
  });

  it("replies with the only drink when search has a single result", async () => {
    stubDrinks([drink("Old Fashioned")]);
    const client = mockClient();
    const interaction = mockInteraction({ search: "old fashioned" });
    const cmd = new Drink(client);
    await cmd.execute(interaction);

    assert.equal(interaction.replies.length, 1);
    assert.equal(interaction.replies[0].embeds[0].data.title, "Old Fashioned");
    assert.equal(interaction.followUps.length, 0);
  });
});
