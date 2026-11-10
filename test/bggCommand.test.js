import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import BoardGameGeek from "../modules/boardgamegeek.js";
import BGG from "../slashcommands/info/bgg.js";
import { assertEphemeral } from "./assertEphemeral.js";

const originalCreateAndLoad = BoardGameGeek.CreateAndLoad;
const loadedDetails = [];

afterEach(() => {
  BoardGameGeek.CreateAndLoad = originalCreateAndLoad;
  loadedDetails.length = 0;
});

function stubCreateAndLoad() {
  BoardGameGeek.CreateAndLoad = async () => ({
    embeds: [{ mock: true }],
    attachments: [],
    otherAttachments: [],
    async LoadEmbeds(detailsType) {
      loadedDetails.push(detailsType);
    },
  });
}

function mockInteraction({ details = null } = {}) {
  const defers = [];
  const edits = [];
  return {
    defers,
    edits,
    options: {
      getString(name) {
        if (name === "game") return "126163";
        if (name === "details") return details;
        return null;
      },
    },
    isAutocomplete() {
      return false;
    },
    async deferReply(payload) {
      defers.push(payload ?? {});
    },
    async editReply(payload) {
      edits.push(payload);
      return payload;
    },
  };
}

function command() {
  return new BGG({
    config: {},
    logger: { log() {} },
  });
}

function assertPublic(payload) {
  assert.ok(payload, "expected a reply payload");
  assert.equal(payload.ephemeral, undefined);
  assert.equal(payload.flags, undefined);
}

describe("/bgg details visibility", () => {
  it("defers and edits publicly when details is omitted", async () => {
    stubCreateAndLoad();
    const interaction = mockInteraction({ details: null });
    await command().execute(interaction);

    assert.equal(interaction.defers.length, 1);
    assertPublic(interaction.defers[0]);
    assertPublic(interaction.edits[0]);
    assert.deepEqual(loadedDetails, [BoardGameGeek.DetailsEnum.ALL]);
  });

  it("defers and edits ephemerally for the allephemeral choice value", async () => {
    stubCreateAndLoad();
    const interaction = mockInteraction({ details: "allephemeral" });
    await command().execute(interaction);

    assertEphemeral(interaction.defers[0]);
    assertEphemeral(interaction.edits[0]);
    assert.deepEqual(loadedDetails, ["allephemeral"]);
  });
});
