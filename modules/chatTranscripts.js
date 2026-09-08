import fs from "node:fs";

import path from "node:path";

import { ChannelType } from "discord.js";


const THREAD_TYPES = new Set(
  [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].filter((type) => type != null)
);
const FORUM_TYPES = new Set(
  [ChannelType.GuildForum, ChannelType.GuildMedia].filter((type) => type != null)
);

function inferKind(channel, fallback = "channel") {
  if (!channel) return fallback;
  if (channel.isThread?.() || THREAD_TYPES.has(channel.type)) return "thread";
  if (FORUM_TYPES.has(channel.type)) return "forum";
  return "channel";
}

function dataDir() {
  return process.env.IS_ON_FLY ? "/data" : "./data";
}

function transcriptsRoot(guildId) {
  return path.join(dataDir(), "transcripts", String(guildId));
}

function utcMonthKey(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 7);
}

function monthBounds(periodKey) {
  const [year, month] = periodKey.split("-").map(Number);
  return {
    start: Date.UTC(year, month - 1, 1),
    end: Date.UTC(year, month, 1),
  };
}

function weekBounds(periodKey) {
  const match = /^(\d{4})-(\d{2})-W(\d+)$/.exec(periodKey);
  if (!match) return monthBounds(periodKey.slice(0, 7));
  const year = Number(match[1]);
  const month = Number(match[2]);
  const week = Number(match[3]);
  const startDay = (week - 1) * 7 + 1;
  const monthEnd = Date.UTC(year, month, 1);
  return {
    start: Date.UTC(year, month - 1, startDay),
    end: Math.min(Date.UTC(year, month - 1, startDay + 7), monthEnd),
  };
}

function periodBounds(periodType, periodKey) {
  return periodType === "week" ? weekBounds(periodKey) : monthBounds(periodKey);
}

function fileNameFor(periodType, periodKey) {
  return `${periodKey}.txt`;
}

function formatTimestamp(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function formatTranscriptLine(row, peopleById) {
  if (!row.content) return null;
  if (row.is_bot) {
    return `[${formatTimestamp(row.created_at)}] ${row.author_name || "bot"}: ${row.content}`;
  }
  const realName = peopleById.get(row.author_id);
  const nick = row.author_name || realName || "unknown";
  const speaker = realName
    ? `${nick} (${realName}, id: <@${row.author_id}>)`
    : `${nick} (id: <@${row.author_id}>)`;
  return `[${formatTimestamp(row.created_at)}] ${speaker}: ${row.content}`;
}

function createChatTranscripts(client) {
  return new ChatTranscripts(client);
}

class ChatTranscripts {
  constructor(client) {
    this.client = client;
    this.queues = new Map();
  }

  invalidate(guildId) {
    this.queues.delete(guildId);
  }

  pickNextJob(guild, db) {
    if (db.hasBackfillCrawlWork()) {
      this.invalidate(guild.id);
      return null;
    }

    let queue = this.queues.get(guild.id);
    if (!queue) {
      queue = this.buildQueue(db);
      this.queues.set(guild.id, queue);
    }

    while (queue.length > 0) {
      const item = queue.shift();
      if (this.shouldCompile(db, item)) return item;
    }

    this.queues.delete(guild.id);
    return null;
  }

  buildQueue(db) {
    const currentMonth = utcMonthKey();
    const items = [];
    for (const row of db.listChannelMonthCounts()) {
      if (row.period_key < currentMonth) {
        items.push({
          period_type: "month",
          channel_id: row.channel_id,
          period_key: row.period_key,
          message_count: row.message_count,
        });
      } else if (row.period_key === currentMonth) {
        const { start, end } = monthBounds(row.period_key);
        for (const week of db.listChannelWeekCounts(row.channel_id, start, end)) {
          items.push({
            period_type: "week",
            channel_id: row.channel_id,
            period_key: `${row.period_key}-W${week.week}`,
            message_count: week.message_count,
          });
        }
      }
    }
    return items;
  }

  shouldCompile(db, item) {
    const existing = db.getTranscriptExport(item.channel_id, item.period_type, item.period_key);
    if (item.period_type === "month") {
      const weeklies = db.listTranscriptWeeksForMonth(item.channel_id, item.period_key);
      if (!existing || weeklies.length > 0) return true;
      return false;
    }
    if (!existing) return true;
    return existing.message_count !== item.message_count;
  }

  async processJob(guild, db, item) {
    const { start, end } = periodBounds(item.period_type, item.period_key);
    const meta = await this.resolveChannelMeta(guild, db, item.channel_id);
    db.setCompileProgress({
      channel_id: item.channel_id,
      period_key: item.period_key,
      period_type: item.period_type,
    });

    const rows = db.listMessagesInRange(item.channel_id, start, end);
    const peopleById = db.getPeopleMap();
    const body = rows.map((row) => formatTranscriptLine(row, peopleById)).filter(Boolean);
    const relativePath = `${item.channel_id}/${fileNameFor(item.period_type, item.period_key)}`;
    const absolutePath = path.join(transcriptsRoot(guild.id), ...relativePath.split("/"));

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, this.renderFile({ guild, meta, item, start, end, rows, body }), "utf8");

    db.upsertTranscriptExport({
      channel_id: item.channel_id,
      period_type: item.period_type,
      period_key: item.period_key,
      path: relativePath,
      channel_name: meta.name,
      parent_channel_id: meta.parentId,
      parent_channel_name: meta.parentName,
      kind: meta.kind,
      start_at: start,
      end_at: end - 1,
      message_count: rows.length,
      compiled_at: Date.now(),
    });

    if (item.period_type === "month") {
      this.removeWeeklies(guild, db, item.channel_id, item.period_key);
    }

    this.client.logger.log(
      `transcript wrote ${meta.name} ${item.period_key} (${rows.length} messages)`,
      "log"
    );
    return meta.fetched;
  }

  removeWeeklies(guild, db, channelId, monthKey) {
    const weeklies = db.listTranscriptWeeksForMonth(channelId, monthKey);
    const root = transcriptsRoot(guild.id);
    for (const weekly of weeklies) {
      try {
        fs.unlinkSync(path.join(root, weekly.path));
      } catch (error) {
        if (error.code !== "ENOENT") this.client.logger.log(error, "warn");
      }
    }
    db.deleteTranscriptWeeksForMonth(channelId, monthKey);
  }

  async resolveChannelMeta(guild, db, channelId) {
    let channel = guild.channels.cache.get(channelId);
    let fetched = false;
    if (!channel) {
      try {
        channel = await guild.channels.fetch(channelId);
        fetched = true;
      } catch {
        channel = null;
      }
    }

    const state = db.getBackfillState(channelId);
    const kind = inferKind(channel, state?.kind || "channel");
    return {
      channelId,
      name: channel?.name || channelId,
      kind,
      parentId: channel?.parentId || null,
      parentName: channel?.parent?.name || null,
      fetched,
    };
  }

  renderFile({ guild, meta, item, start, end, rows, body }) {
    const header = [
      `# ${meta.name}`,
      `# kind: ${meta.kind}`,
      `# channel_id: ${meta.channelId}`,
      `# guild_id: ${guild.id}`,
    ];
    if (meta.parentId) {
      header.push(`# parent: ${meta.parentName || meta.parentId}`);
      header.push(`# parent_channel_id: ${meta.parentId}`);
    }
    header.push(`# period: ${item.period_key}`);
    header.push(`# period_type: ${item.period_type}`);
    header.push(`# range: ${new Date(start).toISOString()} — ${new Date(end - 1).toISOString()}`);
    header.push(`# messages: ${rows.length}`);
    if (body.length === 0) {
      header.push("# (no text content in this period)");
    }
    return `${header.join("\n")}\n\n${body.join("\n")}\n`;
  }
}

export { createChatTranscripts, dataDir, fileNameFor, monthBounds, periodBounds, transcriptsRoot, utcMonthKey, weekBounds };
