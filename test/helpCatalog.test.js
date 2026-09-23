import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import klaw from "klaw";
import { Collection } from "discord.js";
import {
  listHelpCommands,
  resolveHelpView,
  formatCommandDetails,
  helpContainsPrefixDocs,
  categoryIdFor,
  OVERVIEW_ID,
} from "../modules/helpCatalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PREFIX_ERA_NAMES = ["bringo", "ferengi", "chatbot", "frozen", "oversee", "eval", "nickname"];

function collectJsFiles(dir) {
  return new Promise((resolve, reject) => {
    const files = [];
    klaw(dir)
      .on("data", (item) => {
        const cmdFile = path.parse(item.path);
        if (!cmdFile.ext || cmdFile.ext !== ".js") return;
        files.push(cmdFile);
      })
      .on("end", () => resolve(files))
      .on("error", reject);
  });
}

async function loadSlashCommands() {
  const collection = new Collection();
  const errors = [];
  const mockClient = { logger: { log() {} }, config: { botOwnerId: "owner-1" } };
  for (const cmdFile of await collectJsFiles(path.join(ROOT, "slashcommands"))) {
    const filePath = path.join(cmdFile.dir, `${cmdFile.name}${cmdFile.ext}`);
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const Cmd = mod.default;
      const props = new Cmd(mockClient);
      if (!props.help.category) {
        props.help.category = path.basename(cmdFile.dir);
      }
      collection.set(props.help.name, props);
    } catch (e) {
      errors.push(`${path.relative(ROOT, filePath)}: ${e && e.stack ? e.stack : e}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return collection;
}

function embedText(embed) {
  const fieldText = (embed.fields || []).map((f) => `${f.name}\n${f.value}`).join("\n");
  return [embed.title, embed.description, embed.footer?.text, fieldText].filter(Boolean).join("\n");
}

describe("help catalog", () => {
  let slashcommands;

  before(async () => {
    slashcommands = await loadSlashCommands();
  });

  it("loads /help and the rest of the live slash set", () => {
    assert.ok(slashcommands.has("help"));
    assert.ok(slashcommands.size >= 30);
  });

  it("lists loaded slash commands for a regular user without prefix leftovers", () => {
    const viewer = { inGuild: true, nsfwChannel: false, isAdmin: false, isOwner: false };
    const listed = listHelpCommands(slashcommands, viewer);
    const names = listed.map((c) => c.help.name);

    assert.ok(names.includes("help"));
    assert.ok(names.includes("setpersonality"));
    assert.ok(names.includes("prompt"));
    assert.ok(names.includes("markov"));
    assert.ok(names.includes("wiki"));
    assert.ok(names.includes("roll"));
    assert.ok(names.includes("dadjoke"));
    assert.ok(!names.includes("people"));
    assert.ok(!names.includes("settings"));
    assert.ok(!names.includes("test"));
    assert.ok(!names.includes("config"));
    assert.ok(!names.includes("starboard"));
    assert.ok(!names.includes("usage"));
    assert.ok(!names.includes("rule34"));
    for (const stale of PREFIX_ERA_NAMES) {
      assert.ok(!names.includes(stale), `prefix-era ${stale} should not appear in /help`);
    }

    const view = resolveHelpView(slashcommands, viewer);
    const text = embedText(view.embed);
    assert.ok(text.includes("Mention me"));
    assert.ok(text.includes("/setpersonality"));
    assert.ok(text.includes("Chat"));
    assert.ok(text.includes("Fun"));
    assert.ok(text.includes("Lookups"));
    assert.ok(!helpContainsPrefixDocs(text), text);
    assert.ok(!text.toLowerCase().includes("my prefix"));
    assert.equal(view.selectedId, OVERVIEW_ID);
  });

  it("shows admin and nsfw commands only when the viewer can use them", () => {
    const sfw = listHelpCommands(slashcommands, {
      inGuild: true,
      nsfwChannel: false,
      isAdmin: false,
      isOwner: false,
    }).map((c) => c.help.name);
    const nsfw = listHelpCommands(slashcommands, {
      inGuild: true,
      nsfwChannel: true,
      isAdmin: false,
      isOwner: false,
    }).map((c) => c.help.name);
    const admin = listHelpCommands(slashcommands, {
      inGuild: true,
      nsfwChannel: false,
      isAdmin: true,
      isOwner: false,
    }).map((c) => c.help.name);
    const owner = listHelpCommands(slashcommands, {
      inGuild: true,
      nsfwChannel: true,
      isAdmin: true,
      isOwner: true,
    }).map((c) => c.help.name);

    assert.ok(!sfw.includes("boobs"));
    assert.ok(nsfw.includes("boobs"));
    assert.ok(nsfw.includes("rule34"));
    assert.ok(!sfw.includes("config"));
    assert.ok(!sfw.includes("context"));
    assert.ok(admin.includes("config"));
    assert.ok(admin.includes("starboard"));
    assert.ok(admin.includes("usage"));
    assert.ok(admin.includes("context"));
    assert.ok(owner.includes("people"));
    assert.ok(owner.includes("settings"));
  });

  it("resolves a command page and category page from the live set", () => {
    const viewer = { inGuild: true, nsfwChannel: false, isAdmin: true, isOwner: false };
    const wiki = resolveHelpView(slashcommands, viewer, { commandName: "wiki" });
    assert.equal(wiki.embed.title, "/wiki");
    assert.ok(wiki.embed.description.includes("wikipedia"));
    assert.ok(wiki.embed.description.includes("page"));
    assert.ok(!helpContainsPrefixDocs(wiki.embed.description));

    const chat = resolveHelpView(slashcommands, viewer, { categoryId: "chat" });
    assert.match(chat.embed.title, /Chat/);
    assert.ok(chat.embed.description.includes("/setpersonality"));
    assert.ok(chat.embed.description.includes("/markov"));
    assert.ok(chat.embed.description.includes("/prompt"));
    assert.ok(chat.embed.description.includes("/context"));

    const missing = resolveHelpView(slashcommands, viewer, { commandName: "bringo" });
    assert.ok(missing.note.includes("not a current slash command"));
    assert.ok(!missing.note.includes("!"));
  });

  it("uses folder defaults so a new command appears without a hardcoded list", () => {
    const fake = {
      help: { name: "newtoy", description: "A brand new slash command", category: "fun" },
      conf: { enabled: true, hidden: false },
      data: { toJSON: () => ({ name: "newtoy", description: "A brand new slash command" }) },
    };
    const extra = new Collection(slashcommands);
    extra.set("newtoy", fake);
    const listed = listHelpCommands(extra, {
      inGuild: true,
      nsfwChannel: false,
      isAdmin: false,
      isOwner: false,
    });
    assert.ok(listed.some((c) => c.help.name === "newtoy"));
    const view = resolveHelpView(extra, { inGuild: true }, { categoryId: "fun" });
    assert.ok(view.embed.description.includes("/newtoy"));
  });

  it("assigns chat/admin categories from command metadata, not leftover prefix groups", () => {
    assert.equal(categoryIdFor(slashcommands.get("setpersonality")), "chat");
    assert.equal(categoryIdFor(slashcommands.get("markov")), "chat");
    assert.equal(categoryIdFor(slashcommands.get("context")), "chat");
    assert.equal(categoryIdFor(slashcommands.get("config")), "admin");
    assert.equal(categoryIdFor(slashcommands.get("starboard")), "admin");
    assert.equal(categoryIdFor(slashcommands.get("usage")), "admin");
    assert.equal(categoryIdFor(slashcommands.get("wiki")), "info");
    assert.equal(categoryIdFor(slashcommands.get("roll")), "games");
    assert.equal(categoryIdFor(slashcommands.get("help")), "util");
  });

  it("includes subcommands on command detail pages", () => {
    const details = formatCommandDetails(slashcommands.get("setpersonality"));
    assert.ok(details.includes("set"));
    assert.ok(details.includes("view"));
    assert.ok(details.includes("reset"));
    assert.ok(!helpContainsPrefixDocs(details));

    const context = formatCommandDetails(slashcommands.get("context"));
    assert.ok(context.includes("status"));
    assert.ok(context.includes("refresh"));
    assert.ok(context.includes("preview"));
    assert.ok(context.includes("attach"));
    assert.match(context, /freshness/i);
  });

  it("sections this-server features and deep-links when command ids are known", () => {
    const on = resolveHelpView(slashcommands, {
      inGuild: true,
      nsfwChannel: false,
      isAdmin: false,
      isOwner: false,
      commandIds: { context: "222", wiki: "100", help: "1" },
      features: {
        known: true,
        items: [
          {
            id: "context_packs",
            label: "Context packs",
            available: true,
            command: "context",
            availableBlurb: "Chat can use this server's play tracker / notes.",
          },
          {
            id: "image_gen",
            label: "Image generation",
            available: true,
            availableBlurb: "Mention Bender and ask for an image.",
          },
          {
            id: "starboard",
            label: "Starboard",
            available: true,
            command: "starboard",
            adminOnly: true,
            availableBlurb: "Starred messages post to the configured channel.",
          },
        ],
      },
    });
    const onText = embedText(on.embed);
    const available = on.embed.fields.find((field) => field.name.includes("Available here"));
    const missing = on.embed.fields.find((field) => field.name.includes("Not set up"));
    assert.ok(available);
    assert.ok(available.value.includes("Context packs"));
    assert.ok(available.value.includes("Image generation"));
    assert.ok(available.value.includes("</context:222>"));
    assert.ok(!available.value.includes("Starboard"), "regular users should not see admin-only starboard");
    assert.equal(missing, undefined);
    assert.ok(onText.includes("</wiki:100>"));
    assert.ok(!onText.toLowerCase().includes("available everywhere"));

    const off = resolveHelpView(slashcommands, {
      inGuild: true,
      nsfwChannel: false,
      isAdmin: true,
      isOwner: false,
      commandIds: { context: "222", starboard: "8" },
      features: {
        known: true,
        items: [
          {
            id: "context_packs",
            label: "Context packs",
            available: false,
            command: "context",
            unavailableBlurb: "No pack registered. Add a published CSV with this command.",
          },
          {
            id: "image_gen",
            label: "Image generation",
            available: false,
            unavailableBlurb: "Not enabled on this server.",
          },
          {
            id: "starboard",
            label: "Starboard",
            available: false,
            command: "starboard",
            adminOnly: true,
            unavailableBlurb: "No starboard channel set.",
          },
        ],
      },
    });
    const offAvailable = off.embed.fields.find((field) => field.name.includes("Available here"));
    const offMissing = off.embed.fields.find((field) => field.name.includes("Not set up"));
    assert.equal(offAvailable, undefined);
    assert.ok(offMissing);
    assert.ok(offMissing.value.includes("Context packs"));
    assert.ok(offMissing.value.includes("Image generation"));
    assert.ok(offMissing.value.includes("Starboard"));
    assert.ok(offMissing.value.includes("</context:222>"));
    assert.ok(offMissing.value.includes("</starboard:8>"));
    const chat = resolveHelpView(slashcommands, {
      inGuild: true,
      features: {
        known: true,
        items: [
          {
            id: "context_packs",
            label: "Context packs",
            available: false,
            unavailableBlurb: "No pack registered.",
          },
          {
            id: "image_gen",
            label: "Image generation",
            available: true,
            availableBlurb: "Mention Bender and ask for an image.",
          },
        ],
      },
    }, { categoryId: "chat" });
    assert.ok(chat.embed.description.includes("Context packs: not set up"));
    assert.ok(chat.embed.description.includes("Image generation: on"));
  });

  it("keeps today's global list when feature flags cannot be read", () => {
    const view = resolveHelpView(slashcommands, {
      inGuild: true,
      nsfwChannel: false,
      isAdmin: false,
      isOwner: false,
      features: { known: false, items: [] },
    });
    const text = embedText(view.embed);
    assert.ok(!text.includes("Available here"));
    assert.ok(!text.includes("Not set up on this server"));
    assert.ok(text.includes("/wiki"));
    assert.ok(text.includes("/setpersonality"));
    assert.ok(view.embed.footer.text.includes("Live slash commands only"));
  });
});
