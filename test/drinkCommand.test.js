import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import Drink, {
  dismissTimedOutReply,
  isCollectorEnd,
  isUnknownMessage,
} from "../slashcommands/fun/drink.js";
import { assertEphemeral } from "./assertEphemeral.js";

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
  const replyResponses = [];
  return {
    replies,
    followUps,
    edits,
    replyResponses,
    options: {
      getString(name) {
        return name === "search" ? search : null;
      },
    },
    async reply(payload) {
      replies.push(payload);
      const response = {
        async awaitMessageComponent() {
          if (typeof awaitComponent === "function") return awaitComponent();
          throw new Error("awaitMessageComponent not stubbed");
        },
      };
      replyResponses.push(response);
      return response;
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
  };
}

describe("drink collector error helpers", () => {
  it("treats InteractionCollectorError as a collector end", () => {
    const error = collectorError("time");
    assert.equal(isCollectorEnd(error), true);
    assert.equal(isUnknownMessage(error), false);
  });

  it("treats InteractionCollectorError with reason messageDelete as a collector end", () => {
    const error = collectorError("messageDelete");
    assert.equal(isCollectorEnd(error), true);
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

  it("collects on the reply object, not the command interaction", async () => {
    stubDrinks([drink("Margarita"), drink("Blue Margarita")]);
    const client = mockClient();
    const collectedOn = [];
    const interaction = {
      options: {
        getString() {
          return "margarita";
        },
      },
      replies: [],
      followUps: [],
      edits: [],
      async reply(payload) {
        interaction.replies.push(payload);
        const response = {
          async awaitMessageComponent() {
            collectedOn.push(response);
            throw collectorError("time");
          },
        };
        interaction.replyResponse = response;
        return response;
      },
      async editReply(payload) {
        interaction.edits.push(payload);
        return payload;
      },
      async followUp(payload) {
        interaction.followUps.push(payload);
        return payload;
      },
    };
    assert.equal("awaitMessageComponent" in interaction, false);

    await new Drink(client).execute(interaction);

    assert.equal(client.logs.length, 0);
    assert.equal(collectedOn.length, 1);
    assert.equal(collectedOn[0], interaction.replyResponse);
    assert.notEqual(interaction.replyResponse, interaction);
    assert.deepEqual(interaction.edits, [{ content: "Timed out", components: [] }]);
  });

  it("does not log collector timeout as an error and clears the select menu", async () => {
    stubDrinks([drink("Margarita"), drink("Blue Margarita")]);
    const client = mockClient();
    const interaction = mockInteraction({
      awaitComponent: async () => {
        throw collectorError("time");
      },
    });
    assert.equal("awaitMessageComponent" in interaction, false);
    const cmd = new Drink(client);
    await cmd.execute(interaction);

    assert.equal(client.logs.length, 0);
    assert.equal(interaction.followUps.length, 0);
    assert.equal(interaction.replies.length, 1);
    assert.match(interaction.replies[0].content, /Multiple results/);
    assertEphemeral(interaction.replies[0]);
    assert.equal(interaction.edits.length, 1);
    assert.deepEqual(interaction.edits[0], { content: "Timed out", components: [] });
    assert.equal(interaction.replyResponses.length, 1);
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
    assert.equal(interaction.replyResponses.length, 1);
  });
});
