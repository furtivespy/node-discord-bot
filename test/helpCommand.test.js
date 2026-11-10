import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Collection } from "discord.js";
import Help from "../slashcommands/util/help.js";
import { assertEphemeral } from "./assertEphemeral.js";

function fakeCommand(name, category) {
  return {
    help: {
      name,
      description: `${name} command`,
      category,
      enabled: true,
      permLevel: "User",
    },
    data: { toJSON: () => ({ name, description: `${name} command` }) },
  };
}

function mockHelp() {
  const slashcommands = new Collection();
  const client = {
    slashcommands,
    logger: { log() {} },
    config: { botOwnerId: "owner-1" },
  };
  const help = new Help(client);
  slashcommands.set("help", help);
  slashcommands.set("wiki", fakeCommand("wiki", "info"));
  slashcommands.set("ping", fakeCommand("ping", "util"));
  return help;
}

function mockInteraction({ withCollector = false } = {}) {
  const collectedOn = [];
  const message = {
    createMessageComponentCollector(options) {
      collectedOn.push({ message: this, options });
      return { on() {} };
    },
  };
  const interaction = {
    guild: { id: "guild-1", name: "Alpha Pub" },
    user: { id: "user-1" },
    memberPermissions: { has: () => false },
    channel: { nsfw: false },
    options: {
      getString() {
        return null;
      },
    },
    replies: [],
    collectedOn,
    message,
    async reply(payload) {
      interaction.replies.push(payload);
      if (withCollector) return { resource: { message } };
      return payload;
    },
  };
  return interaction;
}

describe("/help", () => {
  it("builds an ephemeral payload with MessageFlags instead of ephemeral: true", () => {
    const help = mockHelp();
    const payload = help.helpPayload(mockInteraction());
    assertEphemeral(payload);
    assert.ok(payload.components.length > 0);
  });

  it("replies with withResponse and collects on resource.message", async () => {
    const help = mockHelp();
    const interaction = mockInteraction({ withCollector: true });
    await help.execute(interaction);

    assert.equal(interaction.replies[0].withResponse, true);
    assert.equal(interaction.replies[0].fetchReply, undefined);
    assertEphemeral(interaction.replies[0]);
    assert.equal(interaction.collectedOn.length, 1);
    assert.equal(interaction.collectedOn[0].message, interaction.message);
    assert.equal(typeof interaction.fetchReply, "undefined");
  });
});
