const { ChannelType, PermissionsBitField } = require("discord.js");
const { isArchivableMessage, toChatMessageRow } = require("./chatArchive.js");
const { createChatTranscripts } = require("./chatTranscripts.js");
const { createChatFileSearch } = require("./chatFileSearch.js");

const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 2000;
const IDLE_DELAY_MS = 5000;
const YIELD_MS = 100;
const BOOT_DELAY_MS = 30_000;
const CRASH_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const TICK_MS = 24 * 60 * 60 * 1000;
const WATCH_POLL_MS = 60_000;
const ACTIVE_STATUSES = new Set(["running", "watching"]);
const SKIP_API_CODES = new Set([10003, 10004, 50001, 50013, 50007]);
const THREAD_TYPES = new Set(
  [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].filter((type) => type != null)
);
const PARENT_TYPES = new Set(
  [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
  ].filter((type) => type != null)
);
const FORUM_TYPES = new Set(
  [ChannelType.GuildForum, ChannelType.GuildMedia].filter((type) => type != null)
);
const MESSAGE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ...THREAD_TYPES,
]);
const HISTORY_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.ReadMessageHistory,
];
const PRIORITIZE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
].filter((type) => type != null);

function createChatBackfill(client) {
  return new ChatBackfill(client);
}

function isThreadChannel(channel) {
  return Boolean(channel?.isThread?.() || THREAD_TYPES.has(channel?.type));
}

function isThreadParent(channel) {
  return PARENT_TYPES.has(channel?.type);
}

function canCrawlMessages(channel) {
  return MESSAGE_TYPES.has(channel?.type);
}

function channelKind(channel) {
  if (isThreadChannel(channel)) return "thread";
  if (FORUM_TYPES.has(channel?.type)) return "forum";
  return "channel";
}

class ChatBackfill {
  constructor(client) {
    this.client = client;
    this.transcripts = createChatTranscripts(client);
    this.fileSearch = createChatFileSearch(client);
    this.loopActive = false;
    this.extraBackoffMs = 0;
    this.tickActive = new Set();
  }

  onReady() {
    const shouldRun = this.client.guilds.cache.some((guild) => {
      try {
        return ACTIVE_STATUSES.has(this.client.getDatabase(guild.id).getBackfillWorker().status);
      } catch (e) {
        this.client.logger.log(e, "error");
        return false;
      }
    });
    if (!shouldRun) return;
    this.client.logger.log(`backfill will resume in ${BOOT_DELAY_MS / 1000}s so startup REST can finish`, "log");
    this.client.wait(BOOT_DELAY_MS).then(() => this.ensureLoop());
  }

  ensureLoop() {
    if (this.loopActive) return;
    this.loopActive = true;
    this.runLoop()
      .catch((e) => {
        this.client.logger.log(e, "error");
        return "crash";
      })
      .then((result) => {
        this.loopActive = false;
        if (result === "crash" && this.anyGuildActive()) {
          this.client.logger.log(`backfill loop crashed; restarting in ${CRASH_BACKOFF_MS / 1000}s`, "warn");
          this.client.wait(CRASH_BACKOFF_MS).then(() => this.ensureLoop());
        }
      });
  }

  async runLoop() {
    while (true) {
      if (!this.client.isReady()) {
        await this.client.wait(IDLE_DELAY_MS);
        continue;
      }

      let job;
      try {
        job = this.pickNextJob();
      } catch (e) {
        this.client.logger.log(e, "error");
        await this.client.wait(CRASH_BACKOFF_MS);
        continue;
      }

      if (!job) {
        if (!this.anyGuildActive()) return;
        await this.client.wait(WATCH_POLL_MS);
        continue;
      }

      let usedApi = false;
      try {
        if (job.type === "compile") {
          usedApi = await this.processCompileJob(job);
        } else if (job.type === "upload") {
          usedApi = await this.processUploadJob(job);
        } else {
          usedApi = await this.processOnePage(job);
        }
      } catch (e) {
        this.client.logger.log(e, "error");
        usedApi = true;
        if (job.type === "compile") {
          try {
            job.db.setCompileProgress({});
          } catch (inner) {
            this.client.logger.log(inner, "error");
          }
        } else if (job.type === "upload") {
          try {
            job.db.setLastUploadError(e.message || String(e));
            job.db.setUploadProgress({});
            this.tickActive.delete(job.guild.id);
          } catch (inner) {
            this.client.logger.log(inner, "error");
          }
        } else {
          try {
            job.db.setBackfillChannelStatus(job.state.channel_id, "error", e.message || String(e));
          } catch (inner) {
            this.client.logger.log(inner, "error");
          }
        }
      }

      if (usedApi) {
        const delay = PAGE_DELAY_MS + this.extraBackoffMs + Math.floor(Math.random() * 250);
        this.extraBackoffMs = 0;
        await this.client.wait(Math.min(delay, MAX_BACKOFF_MS));
      } else {
        this.extraBackoffMs = 0;
        await this.client.wait(YIELD_MS);
      }
    }
  }

  anyGuildActive() {
    for (const guild of this.client.guilds.cache.values()) {
      try {
        if (ACTIVE_STATUSES.has(this.client.getDatabase(guild.id).getBackfillWorker().status)) {
          return true;
        }
      } catch (e) {
        this.client.logger.log(e, "error");
      }
    }
    return false;
  }

  tickDue(worker) {
    return Date.now() - (worker.last_tick_at || 0) >= TICK_MS;
  }

  shouldUpload(worker, db) {
    const pending = db.getPendingTranscriptUpload();
    const needsStore = !db.getFileSearchStore();
    if (!pending && !needsStore) return false;
    if (worker.last_upload_error) {
      const elapsed = Date.now() - (worker.updated_at || 0);
      const cooldown = worker.status === "watching" ? TICK_MS : Math.min(MAX_BACKOFF_MS, 60_000);
      if (elapsed < cooldown) return false;
    }
    return true;
  }

  pickNextJob() {
    for (const guild of this.client.guilds.cache.values()) {
      let db;
      try {
        db = this.client.getDatabase(guild.id);
      } catch (e) {
        this.client.logger.log(e, "error");
        continue;
      }
      const worker = db.getBackfillWorker();
      if (!ACTIVE_STATUSES.has(worker.status)) continue;

      if (worker.status === "running") {
        const state = db.getNextBackfillChannel(worker.priority_channel_id);
        if (state) {
          if (worker.priority_channel_id && state.channel_id === worker.priority_channel_id) {
            db.setBackfillPriority(null);
          }
          return { type: "crawl", guild, db, state };
        }

        const compile = this.transcripts.pickNextJob(guild, db);
        if (compile) {
          return { type: "compile", guild, db, item: compile };
        }

        if (this.shouldUpload(worker, db)) {
          return { type: "upload", guild, db };
        }

        db.setCompileProgress({});
        db.setUploadProgress({});
        db.setLastTickAt(Date.now());
        db.setBackfillWorkerStatus("watching");
        this.tickActive.delete(guild.id);
        this.client.logger.log(
          `backfill, transcripts, and file search upload finished in ${guild.name}; watching for weekly updates`,
          "log"
        );
        continue;
      }

      const tickOpen =
        this.tickActive.has(guild.id) ||
        this.tickDue(worker) ||
        (Boolean(db.getPendingTranscriptUpload()) && !worker.last_upload_error);
      if (!tickOpen) continue;

      this.tickActive.add(guild.id);
      if (this.tickDue(worker)) {
        this.transcripts.invalidate(guild.id);
      }

      const compile = this.transcripts.pickNextJob(guild, db);
      if (compile) {
        return { type: "compile", guild, db, item: compile };
      }

      if (this.shouldUpload(worker, db)) {
        return { type: "upload", guild, db };
      }

      this.tickActive.delete(guild.id);
      db.setCompileProgress({});
      db.setUploadProgress({});
      db.setLastTickAt(Date.now());
    }
    return null;
  }

  async processCompileJob(job) {
    let weeklies = [];
    if (job.item.period_type === "month") {
      weeklies = job.db.listTranscriptWeeksForMonth(job.item.channel_id, job.item.period_key);
    }
    const fetched = await this.transcripts.processJob(job.guild, job.db, job.item);
    if (weeklies.length) {
      await this.fileSearch.deleteDocuments(job.db, weeklies);
    }
    return fetched;
  }

  async processUploadJob(job) {
    try {
      const usedApi = await this.fileSearch.processUploadJob(job.guild, job.db);
      if (job.db.getBackfillWorker().last_upload_error) {
        this.tickActive.delete(job.guild.id);
      }
      return usedApi;
    } catch (error) {
      this.tickActive.delete(job.guild.id);
      throw error;
    }
  }

  async startGuild(guild) {
    const db = this.client.getDatabase(guild.id);
    this.transcripts.invalidate(guild.id);
    await this.syncChannels(guild);
    db.resetBackfillErrors();
    db.setCompileProgress({});
    db.setUploadProgress({});
    db.setLastUploadError(null);
    db.setBackfillWorkerStatus("running");
    this.ensureLoop();
  }

  pauseGuild(guild) {
    this.tickActive.delete(guild.id);
    this.client.getDatabase(guild.id).setBackfillWorkerStatus("paused");
  }

  async resumeGuild(guild) {
    await this.startGuild(guild);
  }

  prioritize(guild, channel) {
    const db = this.client.getDatabase(guild.id);
    const channelId = channel.id;
    const existing = db.getBackfillState(channelId);
    if (existing?.status === "caught_up") {
      return {
        message: `<#${channelId}> is already caught up. It will not be recrawled; pick a channel that is still pending.`,
      };
    }
    db.setBackfillPriority(channelId);
    if (!existing) {
      db.ensureBackfillChannel(channelId, "pending", {
        kind: channelKind(channel),
        threads_synced: isThreadChannel(channel) ? 1 : 0,
      });
    } else if (existing.status === "skipped" || existing.status === "error") {
      db.setBackfillChannelStatus(channelId, "pending");
    }
    return { message: `<#${channelId}> will be crawled next.` };
  }

  async syncChannels(guild) {
    await guild.channels.fetch();
    const db = this.client.getDatabase(guild.id);
    const skipChannels = this.client.getSkipChannels(guild);

    for (const channel of guild.channels.cache.values()) {
      if (isThreadChannel(channel)) {
        this.queueTarget(guild, db, channel, skipChannels);
      } else if (isThreadParent(channel)) {
        this.queueTarget(guild, db, channel, skipChannels);
      }
    }

    try {
      const active = await guild.channels.fetchActiveThreads(false);
      for (const thread of active.threads.values()) {
        this.queueTarget(guild, db, thread, skipChannels);
      }
    } catch (error) {
      if (!this.isRateLimit(error)) {
        this.client.logger.log(error, "warn");
      } else {
        this.extraBackoffMs = retryAfterMs(error);
      }
    }
  }

  queueTarget(guild, db, channel, skipChannels) {
    const reason = this.channelSkipReason(guild, channel, skipChannels);
    const existing = db.getBackfillState(channel.id);
    const kind = channelKind(channel);
    const threadsSynced = isThreadChannel(channel) ? 1 : 0;

    if (reason) {
      if (!existing || existing.status !== "caught_up") {
        db.ensureBackfillChannel(channel.id, "skipped", { kind, threads_synced: threadsSynced });
        db.setBackfillChannelStatus(channel.id, "skipped", reason);
      }
      return;
    }

    if (!existing) {
      db.ensureBackfillChannel(channel.id, "pending", { kind, threads_synced: threadsSynced });
      return;
    }

    if (existing.status === "skipped") {
      db.setBackfillChannelStatus(channel.id, "pending");
    }

    if (!isThreadChannel(channel) && existing.status === "caught_up" && !existing.threads_synced) {
      db.setBackfillChannelStatus(channel.id, "discovering");
    }
  }

  channelSkipReason(guild, channel, skipChannels = this.client.getSkipChannels(guild)) {
    if (channel.nsfw || channel.parent?.nsfw) return "nsfw";
    if (skipChannels.includes(channel.id)) return "skip list";
    if (channel.parentId && skipChannels.includes(channel.parentId)) return "skip list (parent)";
    const me = guild.members.me;
    if (!me) return "bot member missing";
    const perms = channel.permissionsFor(me);
    if (!perms || !perms.has(HISTORY_PERMS)) return "missing ViewChannel/ReadMessageHistory";
    return null;
  }

  async processOnePage(job) {
    const { guild, db, state } = job;
    let channel = guild.channels.cache.get(state.channel_id);
    let fetchedChannel = false;
    try {
      if (!channel) {
        channel = await guild.channels.fetch(state.channel_id);
        fetchedChannel = true;
      }
    } catch (error) {
      if (this.isRateLimit(error)) {
        this.extraBackoffMs = retryAfterMs(error);
        this.client.logger.log(
          `backfill rate limited fetching channel ${state.channel_id}; waiting ${this.extraBackoffMs}ms`,
          "warn"
        );
        return true;
      }
      this.handleChannelError(db, state.channel_id, error);
      return fetchedChannel;
    }

    const knownType = isThreadParent(channel) || canCrawlMessages(channel);
    if (!channel || !knownType) {
      db.setBackfillChannelStatus(state.channel_id, "skipped", "not a crawlable text channel or thread");
      return fetchedChannel;
    }

    const skipReason = this.channelSkipReason(guild, channel);
    if (skipReason) {
      db.setBackfillChannelStatus(state.channel_id, "skipped", skipReason);
      return fetchedChannel;
    }

    if (isThreadParent(channel) && !state.threads_synced) {
      return this.discoverArchivedPage(job, channel);
    }

    if (!canCrawlMessages(channel)) {
      db.setBackfillChannelStatus(state.channel_id, "caught_up");
      return fetchedChannel;
    }

    if (state.status === "pending" || state.status === "error") {
      db.setBackfillChannelStatus(state.channel_id, "running");
      this.client.logger.log(
        `backfill ${guild.name} #${channel.name} from ${state.oldest_id_seen || "newest"}`,
        "log"
      );
    }

    const fetchOptions = { limit: PAGE_SIZE, cache: false };
    if (state.oldest_id_seen) fetchOptions.before = state.oldest_id_seen;

    let messages;
    try {
      messages = await channel.messages.fetch(fetchOptions);
    } catch (error) {
      if (this.isRateLimit(error)) {
        this.extraBackoffMs = retryAfterMs(error);
        this.client.logger.log(
          `backfill rate limited on #${channel.name}; waiting ${this.extraBackoffMs}ms`,
          "warn"
        );
        return true;
      }
      this.handleChannelError(db, state.channel_id, error);
      return true;
    }

    if (messages.size === 0) {
      db.updateBackfillProgress({
        channel_id: state.channel_id,
        oldest_id_seen: state.oldest_id_seen,
        newest_id_seen: null,
        status: "caught_up",
        added: 0,
        last_error: null,
      });
      this.client.logger.log(`backfill caught up in ${guild.name} #${channel.name}`, "log");
      return true;
    }

    const rows = [];
    for (const message of messages.values()) {
      if (!isArchivableMessage(this.client, message, { channelAlreadyChecked: true })) continue;
      rows.push(toChatMessageRow(message));
    }
    const oldest = messages.last();
    const newest = messages.first();
    const caughtUp = messages.size < PAGE_SIZE;

    db.commitBackfillPage(rows, {
      channel_id: state.channel_id,
      oldest_id_seen: oldest.id,
      newest_id_seen: newest.id,
      status: caughtUp ? "caught_up" : "running",
      last_error: null,
    });

    if (caughtUp) {
      this.client.logger.log(`backfill caught up in ${guild.name} #${channel.name}`, "log");
    }
    return true;
  }

  async discoverArchivedPage(job, channel) {
    const { guild, db, state } = job;
    if (!channel.threads?.fetchArchived) {
      this.finishThreadDiscovery(db, channel, state);
      return false;
    }

    let kind = state.thread_archive_kind || "public";
    if (kind !== "public" && kind !== "private") kind = "public";

    if (state.status !== "discovering") {
      db.setBackfillChannelStatus(state.channel_id, "discovering");
      this.client.logger.log(
        `backfill discovering ${kind} threads in ${guild.name} #${channel.name}`,
        "log"
      );
    }

    const options = { type: kind, limit: 100, fetchAll: kind === "private" };
    if (state.thread_archive_before) options.before = state.thread_archive_before;

    let result;
    try {
      result = await channel.threads.fetchArchived(options, false);
    } catch (error) {
      if (this.isRateLimit(error)) {
        this.extraBackoffMs = retryAfterMs(error);
        this.client.logger.log(
          `backfill rate limited discovering threads in #${channel.name}; waiting ${this.extraBackoffMs}ms`,
          "warn"
        );
        return true;
      }
      if (kind === "private" && SKIP_API_CODES.has(error?.code)) {
        this.finishThreadDiscovery(db, channel, state);
        return true;
      }
      this.handleChannelError(db, state.channel_id, error);
      return true;
    }

    const skipChannels = this.client.getSkipChannels(guild);
    for (const thread of result.threads.values()) {
      this.queueTarget(guild, db, thread, skipChannels);
    }

    if ((result.hasMore || result.threads.size >= 100) && result.threads.size > 0) {
      const last = result.threads.last();
      const before =
        last?.archivedAt instanceof Date ? last.archivedAt.toISOString() : last?.id;
      db.updateThreadDiscovery({
        channel_id: state.channel_id,
        thread_archive_before: before || null,
        thread_archive_kind: kind,
        threads_synced: 0,
        status: "discovering",
      });
      return true;
    }

    if (kind === "public") {
      db.updateThreadDiscovery({
        channel_id: state.channel_id,
        thread_archive_before: null,
        thread_archive_kind: "private",
        threads_synced: 0,
        status: "discovering",
      });
      return true;
    }

    this.finishThreadDiscovery(db, channel, state);
    return true;
  }

  finishThreadDiscovery(db, channel, state) {
    const stillNeedsMessages =
      canCrawlMessages(channel) && !state.oldest_id_seen && (state.messages_stored || 0) === 0;
    db.updateThreadDiscovery({
      channel_id: state.channel_id,
      thread_archive_before: null,
      thread_archive_kind: "done",
      threads_synced: 1,
      status: stillNeedsMessages ? "pending" : "caught_up",
    });
    this.client.logger.log(
      `backfill finished thread discovery in #${channel.name}`,
      "log"
    );
  }

  handleChannelError(db, channelId, error) {
    const code = error?.code;
    if (SKIP_API_CODES.has(code)) {
      db.setBackfillChannelStatus(channelId, "skipped", error.message || String(code));
      return;
    }
    db.setBackfillChannelStatus(channelId, "error", error.message || String(error));
    this.client.logger.log(error, "error");
  }

  isRateLimit(error) {
    return error?.status === 429 || error?.name === "RateLimitError";
  }
}

function retryAfterMs(error) {
  let value = error.retryAfter ?? error.retry_after;
  if (value == null) return 10_000;
  value = Number(value);
  if (!Number.isFinite(value) || value < 0) return 10_000;
  const ms = value < 1000 ? value * 1000 : value;
  return Math.min(Math.ceil(ms) + 250, MAX_BACKOFF_MS);
}

module.exports = { createChatBackfill, channelKind, PAGE_DELAY_MS, PAGE_SIZE, PRIORITIZE_CHANNEL_TYPES };
