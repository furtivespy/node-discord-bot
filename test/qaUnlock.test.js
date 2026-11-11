import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PermissionsBitField } from "discord.js";
import {
  QA_UNLOCK_ADMIN_COMMANDS,
  commandRegistrationPayload,
  isQaUnlockAdminCommands,
  qaUnlockAdminCommandsEnabled,
  stripAdministratorDefaultMemberPermissions,
} from "../modules/qaUnlock.js";
import { canViewContextDashboard } from "../modules/contextPackFreshness.js";
import { canViewHealth } from "../modules/guildHealth.js";
import Context from "../slashcommands/util/context.js";
import Status, { canViewHealth as statusCanViewHealth } from "../slashcommands/util/status.js";
import Usage, { canViewUsage } from "../slashcommands/util/usage.js";
import Config from "../slashcommands/util/config.js";
import Settings from "../slashcommands/util/settings.js";
import Starboard from "../slashcommands/util/starboard.js";
import TestCommand from "../slashcommands/util/test.js";
import People from "../slashcommands/util/people.js";
import { assertEphemeral } from "./assertEphemeral.js";

const ADMINISTRATOR = String(PermissionsBitField.Flags.Administrator);
const MANAGE_MESSAGES = String(PermissionsBitField.Flags.ManageMessages);

function mockClient({ unlock = false, ownerId = "owner-1" } = {}) {
  return {
    qaUnlockAdminCommands: unlock,
    config: { botOwnerId: ownerId },
    logger: { log() {} },
    settings: { get() { return {}; }, has() { return false; }, set() {} },
    getSettings() {
      return {};
    },
    getGameData() {
      return {};
    },
    geminiAI: { contextPacks: null },
  };
}

function mockInteraction({ isAdmin = false, userId = "qa-1", subcommand = "list" } = {}) {
  const replies = [];
  return {
    guild: { id: "guild-1", name: "Alpha Pub" },
    user: { id: userId },
    member: { id: userId },
    memberPermissions: {
      has(flag) {
        return isAdmin && flag === PermissionsBitField.Flags.Administrator;
      },
    },
    options: {
      getSubcommand: () => subcommand,
      getString() {
        return null;
      },
      getBoolean() {
        return null;
      },
      getChannel() {
        return null;
      },
      getInteger() {
        return null;
      },
    },
    replies,
    async reply(payload) {
      replies.push(payload);
      return payload;
    },
  };
}

describe("isQaUnlockAdminCommands", () => {
  it("is off when the env var is unset, empty, or 0", () => {
    assert.equal(isQaUnlockAdminCommands({}), false);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "" }), false);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "   " }), false);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "0" }), false);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "false" }), false);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "off" }), false);
  });

  it("is on when the env var is 1 or true", () => {
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "1" }), true);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "true" }), true);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "TRUE" }), true);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "yes" }), true);
    assert.equal(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "on" }), true);
  });
});

describe("stripAdministratorDefaultMemberPermissions", () => {
  it("clears Administrator-only defaultMemberPermissions", () => {
    const json = { default_member_permissions: ADMINISTRATOR };
    stripAdministratorDefaultMemberPermissions(json);
    assert.equal(json.default_member_permissions, null);
  });

  it("leaves ManageMessages and other non-admin gates alone", () => {
    const json = { default_member_permissions: MANAGE_MESSAGES };
    stripAdministratorDefaultMemberPermissions(json);
    assert.equal(json.default_member_permissions, MANAGE_MESSAGES);
  });

  it("removes only the Administrator bit from a combined permission", () => {
    const combined = String(
      PermissionsBitField.Flags.Administrator | PermissionsBitField.Flags.ManageMessages
    );
    const json = { default_member_permissions: combined };
    stripAdministratorDefaultMemberPermissions(json);
    assert.equal(json.default_member_permissions, MANAGE_MESSAGES);
  });
});

describe("commandRegistrationPayload", () => {
  const client = mockClient();
  const adminCommands = [
    new Context(client),
    new Status(client),
    new Settings(client),
    new Config(client),
    new Starboard(client),
    new Usage(client),
    new TestCommand(client),
  ];

  it("strips Administrator when unlocked and leaves the builder unchanged", () => {
    for (const command of adminCommands) {
      const unlocked = commandRegistrationPayload(command, true);
      const locked = commandRegistrationPayload(command, false);
      assert.equal(
        unlocked.default_member_permissions,
        null,
        `${command.help.name} unlocked`
      );
      assert.equal(
        locked.default_member_permissions,
        ADMINISTRATOR,
        `${command.help.name} locked`
      );
      assert.equal(
        command.data.toJSON().default_member_permissions,
        ADMINISTRATOR,
        `${command.help.name} builder`
      );
    }
  });
});

describe("runtime administrator checks", () => {
  it("skips guild-admin gates when unlocked and keeps them when unset", () => {
    const locked = mockClient({ unlock: false });
    const unlocked = mockClient({ unlock: true });
    const qa = mockInteraction({ isAdmin: false, userId: "qa-1" });

    assert.equal(qaUnlockAdminCommandsEnabled(locked), false);
    assert.equal(qaUnlockAdminCommandsEnabled(unlocked), true);

    assert.equal(canViewContextDashboard(locked, qa), false);
    assert.equal(canViewContextDashboard(unlocked, qa), true);
    assert.equal(canViewHealth(locked, qa), false);
    assert.equal(canViewHealth(unlocked, qa), true);
    assert.equal(statusCanViewHealth(locked, qa), false);
    assert.equal(statusCanViewHealth(unlocked, qa), true);
    assert.equal(canViewUsage(locked, qa), false);
    assert.equal(canViewUsage(unlocked, qa), true);
  });

  it("lets a non-admin run /context and /status when unlocked", async () => {
    const client = mockClient({ unlock: true });
    const context = new Context(client);
    const listed = mockInteraction({ isAdmin: false, subcommand: "list" });
    await context.execute(listed);
    assertEphemeral(listed.replies[0]);
    assert.doesNotMatch(listed.replies[0].content || "", /only for server administrators/);

    const status = new Status(client);
    const health = mockInteraction({ isAdmin: false });
    await status.execute(health);
    assert.ok(health.replies[0].embeds);
    assert.doesNotMatch(health.replies[0].content || "", /only for server administrators/);
  });

  it("still rejects a non-admin when the env override is unset", async () => {
    const client = mockClient({ unlock: false });
    const context = new Context(client);
    const listed = mockInteraction({ isAdmin: false, subcommand: "list" });
    await context.execute(listed);
    assertEphemeral(listed.replies[0]);
    assert.match(listed.replies[0].content, /only for server administrators/);

    const status = new Status(client);
    const health = mockInteraction({ isAdmin: false });
    await status.execute(health);
    assertEphemeral(health.replies[0]);
    assert.match(health.replies[0].content, /only for server administrators/);
  });

  it("does not weaken bot-owner checks when unlocked", async () => {
    const client = mockClient({ unlock: true, ownerId: "owner-1" });
    const settings = new Settings(client);
    const qa = mockInteraction({ isAdmin: false, userId: "qa-1" });
    await settings.execute(qa);
    assertEphemeral(qa.replies[0]);
    assert.match(qa.replies[0].content, /do not have permission/);

    const people = new People(client);
    const peopleQa = mockInteraction({ isAdmin: false, userId: "qa-1" });
    await people.execute(peopleQa);
    assertEphemeral(peopleQa.replies[0]);
    assert.match(peopleQa.replies[0].content, /only for the bot owner/);
  });
});
