import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

export function assertEphemeral(payload) {
  assert.ok(payload, "expected a reply payload");
  assert.equal(payload.ephemeral, undefined);
  assert.equal(payload.flags, MessageFlags.Ephemeral);
}
