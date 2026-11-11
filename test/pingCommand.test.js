import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Ping from "../slashcommands/util/ping.js";
import TestCommand from "../slashcommands/util/test.js";

function mockPingInteraction() {
  const edits = [];
  const message = {
    createdTimestamp: 42,
    async edit(content) {
      edits.push(content);
    },
  };
  const interaction = {
    createdTimestamp: 10,
    replies: [],
    async reply(payload) {
      interaction.replies.push(payload);
      return { resource: { message } };
    },
  };
  return { interaction, edits, message };
}

describe("/ping", () => {
  it("uses withResponse and edits resource.message", async () => {
    const { interaction, edits, message } = mockPingInteraction();
    const cmd = new Ping({ logger: { log() {} } });
    await cmd.execute(interaction);

    assert.equal(interaction.replies[0].withResponse, true);
    assert.equal(interaction.replies[0].fetchReply, undefined);
    assert.equal(interaction.replies[0].content, "Pong!");
    assert.equal(edits.length, 1);
    assert.match(edits[0], /Latency is 32ms/);
    assert.equal(message.createdTimestamp - interaction.createdTimestamp, 32);
  });
});

describe("/test", () => {
  it("uses withResponse and edits resource.message", async () => {
    const { interaction, edits } = mockPingInteraction();
    const cmd = new TestCommand({ logger: { log() {} } });
    await cmd.execute(interaction);

    assert.equal(interaction.replies[0].withResponse, true);
    assert.equal(interaction.replies[0].fetchReply, undefined);
    assert.match(edits[0], /Latency is 32ms/);
  });
});
