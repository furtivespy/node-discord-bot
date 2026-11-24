/**
 * `execute`: run a fixture through real slash-command code without Discord.
 *
 * Uses a fake Discord interaction and in-memory / temp-dir stores. Nothing
 * talks to Discord. It proves what a command replies and logs, not how Discord
 * renders it or whether live external APIs respond.
 *
 * A fixture exports `export default async function (ctx) { ... }`.
 * See scripts/control-fixtures/.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Collection, MessageFlags, PermissionsBitField } from "discord.js";
import Database from "../../db/db.js";
import { loadCommands } from "./featureMap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

function isEphemeral(payload) {
  const flags = payload?.flags;
  if (Array.isArray(flags)) return flags.includes(MessageFlags.Ephemeral);
  if (typeof flags === "number" || typeof flags === "bigint") {
    return (BigInt(flags) & BigInt(MessageFlags.Ephemeral)) !== 0n;
  }
  return false;
}

function embedPlainText(embed) {
  const raw = typeof embed?.toJSON === "function" ? embed.toJSON() : embed;
  if (!raw || typeof raw !== "object") return "";
  const parts = [];
  if (raw.title) parts.push(raw.title);
  if (raw.description) parts.push(raw.description);
  for (const field of raw.fields || []) {
    parts.push(`${field.name}: ${field.value}`);
  }
  if (raw.footer?.text) parts.push(raw.footer.text);
  return parts.join("\n").trim();
}

function summarizePayload(kind, payload) {
  if (typeof payload === "string") {
    return { kind, text: payload, embeds: [], visibility: "public", components: 0, files: 0 };
  }
  return {
    kind,
    text: payload?.content ?? null,
    embeds: (payload?.embeds || []).map(embedPlainText).filter(Boolean),
    visibility: isEphemeral(payload) ? "ephemeral" : "public",
    components: payload?.components?.length ?? 0,
    files: payload?.files?.length ?? 0,
  };
}

function createMapStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    has: (k) => map.has(k),
    get: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v);
      return map;
    },
    delete: (k) => map.delete(k),
    ensure: (k, def) => {
      if (!map.has(k)) map.set(k, structuredClone(def));
      return map.get(k);
    },
    entries: () => map.entries(),
    keys: () => map.keys(),
  };
}

function createFakeInteraction(options = {}) {
  const {
    subcommand = null,
    subcommandGroup = null,
    strings = {},
    integers = {},
    numbers = {},
    booleans = {},
    users = {},
    channels = {},
    guild = { id: "control-guild", name: "Control Guild" },
    user = { id: "control-user", username: "control-user", tag: "control-user#0001" },
    channel = { id: "control-channel", name: "general", nsfw: Boolean(options.nsfw) },
    isAdmin = false,
    interactionExtras = {},
  } = options;

  const calls = { reply: [], editReply: [], followUp: [], messageEdit: [] };
  const createdTimestamp = Date.now();
  const message = {
    id: "control-message-1",
    createdTimestamp: createdTimestamp + 15,
    async edit(payload) {
      calls.messageEdit.push(payload);
      return this;
    },
    createMessageComponentCollector() {
      return { on() {}, stop() {} };
    },
  };

  const memberPermissions = new PermissionsBitField(
    isAdmin ? [PermissionsBitField.Flags.Administrator] : []
  );

  const interaction = {
    id: "control-interaction-1",
    createdTimestamp,
    guild,
    guildId: guild ? guild.id : null,
    user,
    member: guild ? { id: user.id, user, permissions: memberPermissions } : null,
    memberPermissions,
    channel,
    channelId: channel ? channel.id : null,
    deferred: false,
    replied: false,
    options: {
      getSubcommand(required = true) {
        if (subcommand == null && required) throw new Error("No subcommand provided");
        return subcommand;
      },
      getSubcommandGroup(required = true) {
        if (subcommandGroup == null && required) throw new Error("No subcommand group provided");
        return subcommandGroup;
      },
      getString: (name) => (name in strings ? strings[name] : null),
      getInteger: (name) => (name in integers ? integers[name] : null),
      getNumber: (name) => (name in numbers ? numbers[name] : null),
      getBoolean: (name) => (name in booleans ? booleans[name] : null),
      getUser: (name) => (name in users ? users[name] : null),
      getChannel: (name) => (name in channels ? channels[name] : null),
    },
    async deferReply() {
      this.deferred = true;
      return { resource: { message } };
    },
    async reply(payload) {
      this.replied = true;
      calls.reply.push(payload);
      return payload?.withResponse ? { resource: { message } } : message;
    },
    async editReply(payload) {
      calls.editReply.push(payload);
      return message;
    },
    async followUp(payload) {
      calls.followUp.push(payload);
      return message;
    },
    ...interactionExtras,
  };

  return { interaction, calls };
}

async function loadSlashCollection(client) {
  const entries = await loadCommands();
  const collection = new Collection();
  for (const entry of entries) {
    const mod = await import(pathToFileURL(path.join(ROOT, entry.source)).href);
    const Command = mod.default;
    const instance = new Command(client);
    if (!instance.help.category) instance.help.category = entry.category;
    collection.set(entry.name, instance);
  }
  return collection;
}

async function runFixtureFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Fixture file not found: ${filePath}`);
  }
  const mod = await import(pathToFileURL(resolved).href);
  const fn = mod.default;
  if (typeof fn !== "function") {
    throw new Error(`Fixture ${filePath} must default-export an async function (ctx) => ...`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "control-bender-"));
  const openDbs = [];
  const results = [];

  try {
    async function run(name, options = {}) {
      const wanted = String(name).replace(/^\//, "");
      const entries = await loadCommands();
      const entry = entries.find((c) => c.name === wanted);
      if (!entry) {
        throw new Error(`Unknown slash command "${wanted}"`);
      }

      const logged = [];
      const recordLog = (level) => (msg, type) => {
        const eff = level === "log" ? type || "log" : level;
        if (eff !== "error" && eff !== "warn") return;
        logged.push({
          level: eff,
          message: msg instanceof Error ? msg.stack || msg.message : String(msg),
        });
      };

      const settings = createMapStore({
        default: {
          prefix: "!",
          markovLevel: "4",
          systemNotice: "true",
        },
        ...(options.settings || {}),
      });

      const dbs = new Map();
      const origCwd = process.cwd();
      const client = {
        config: {
          botOwnerId: options.isOwner ? "control-user" : "owner-id",
          google_key: "",
          google_cxid: "",
          ...(options.config || {}),
        },
        settings,
        exclusions: createMapStore(),
        gamedata: createMapStore(),
        skipChannels: createMapStore(),
        logger: {
          log: recordLog("log"),
          error: recordLog("error"),
          warn: recordLog("warn"),
        },
        getSettings(guild) {
          const base = settings.get("default") || {};
          if (!guild) return base;
          return { ...base, ...(settings.get(guild.id) || {}) };
        },
        getDatabase(guildId) {
          const key = String(guildId);
          if (!dbs.has(key)) {
            fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
            process.chdir(tempDir);
            try {
              const db = new Database(key);
              dbs.set(key, db);
              openDbs.push(db);
            } finally {
              process.chdir(origCwd);
            }
          }
          return dbs.get(key);
        },
        ...(options.clientExtras || {}),
      };

      if (!client.slashcommands) {
        client.slashcommands = await loadSlashCollection(client);
      }

      if (typeof options.seed === "function") {
        await options.seed({ client });
      }

      const CommandMod = await import(pathToFileURL(path.join(ROOT, entry.source)).href);
      const command = new CommandMod.default(client);
      const { interaction, calls } = createFakeInteraction(options);

      await command.execute(interaction);

      const replies = [
        ...calls.reply.map((p) => summarizePayload("reply", p)),
        ...calls.editReply.map((p) => summarizePayload("editReply", p)),
        ...calls.followUp.map((p) => summarizePayload("followUp", p)),
        ...calls.messageEdit.map((p) => summarizePayload("messageEdit", p)),
      ];

      const summary = {
        command: [
          `/${wanted}`,
          options.subcommandGroup,
          options.subcommand,
        ]
          .filter(Boolean)
          .join(" "),
        replies,
        logged,
      };
      results.push(summary);
      return summary;
    }

    const returned = await fn({ run, stubs: { mapStore: createMapStore } });
    return { results, returned };
  } finally {
    for (const db of openDbs) {
      try {
        db.db?.close();
      } catch {}
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function allText(results) {
  const chunks = [];
  for (const r of results) {
    for (const rep of r.replies) {
      if (rep.text) chunks.push(rep.text);
      for (const e of rep.embeds) chunks.push(e);
    }
  }
  return chunks.join("\n");
}

function formatSummary(summary) {
  const lines = [`=== ${summary.command} ===`];
  if (!summary.replies.length) {
    lines.push("  (no replies)");
  }
  for (const r of summary.replies) {
    lines.push(`  [${r.kind} · ${r.visibility}]`);
    if (r.text) lines.push(`    ${r.text.replace(/\n/g, "\n    ")}`);
    for (const e of r.embeds) {
      lines.push(`    [embed] ${e.replace(/\n/g, "\n            ")}`);
    }
    if (r.components) lines.push(`    (${r.components} component row(s))`);
    if (r.files) lines.push(`    (${r.files} file(s))`);
  }
  for (const entry of summary.logged) {
    lines.push(`  LOGGED ${entry.level.toUpperCase()}: ${entry.message.split("\n")[0]}`);
  }
  return lines.join("\n");
}

export { allText, createMapStore, formatSummary, runFixtureFile };
