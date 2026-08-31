const fs = require("fs");
const path = require("path");
const { transcriptsRoot } = require("./chatTranscripts.js");

const POLL_MS = 3000;
const MAX_POLLS = 80;

function createChatFileSearch(client) {
  return new ChatFileSearch(client);
}

function storeDisplayName(guild) {
  const raw = `bender-${guild.name || guild.id}`.replace(/[^\w\- ]+/g, "").trim();
  return (raw || `bender-${guild.id}`).slice(0, 80);
}

function documentDisplayName(row) {
  return `${row.channel_id}-${row.period_key}.txt`.slice(0, 120);
}

function metadataFor(row, guildId) {
  const items = [
    { key: "guild_id", stringValue: String(guildId) },
    { key: "channel_id", stringValue: String(row.channel_id) },
    { key: "channel_name", stringValue: String(row.channel_name || row.channel_id) },
    { key: "kind", stringValue: String(row.kind || "channel") },
    { key: "period_key", stringValue: String(row.period_key) },
    { key: "period_type", stringValue: String(row.period_type) },
  ];
  if (row.parent_channel_id) {
    items.push({ key: "parent_channel_id", stringValue: String(row.parent_channel_id) });
  }
  if (row.parent_channel_name) {
    items.push({ key: "parent_channel_name", stringValue: String(row.parent_channel_name) });
  }
  return items;
}

class ChatFileSearch {
  constructor(client) {
    this.client = client;
  }

  ai() {
    return this.client.geminiAI.AI2;
  }

  async ensureStore(guild, db) {
    const existing = db.getFileSearchStore();
    if (existing) return existing;

    const created = await this.ai().fileSearchStores.create({
      config: { displayName: storeDisplayName(guild) },
    });
    if (!created?.name) throw new Error("File Search store create returned no name");
    db.setFileSearchStore(created.name);
    this.client.logger.log(`file search store created for ${guild.name}: ${created.name}`, "log");
    return created.name;
  }

  async processUploadJob(guild, db) {
    let store;
    try {
      store = await this.ensureStore(guild, db);
      db.setLastUploadError(null);
    } catch (error) {
      const message = error.message || String(error);
      db.setLastUploadError(message);
      this.client.logger.log(error, "error");
      return true;
    }

    const row = db.getPendingTranscriptUpload();
    if (!row) {
      db.setUploadProgress({});
      return false;
    }

    db.setUploadProgress({
      channel_id: row.channel_id,
      period_key: row.period_key,
      period_type: row.period_type,
    });

    const absolutePath = path.join(transcriptsRoot(guild.id), ...String(row.path).split("/"));
    if (!fs.existsSync(absolutePath)) {
      this.client.logger.log(
        `transcript file missing, skipping upload: ${row.path}`,
        "warn"
      );
      db.markTranscriptUploadSkipped(row.channel_id, row.period_type, row.period_key);
      return false;
    }

    if (row.file_search_document_id) {
      await this.deleteDocument(store, row.file_search_document_id);
    }

    const documentName = await this.uploadFile(store, absolutePath, row, guild.id);
    db.markTranscriptUploaded(row.channel_id, row.period_type, row.period_key, documentName);
    db.setLastUploadError(null);
    this.client.logger.log(
      `file search uploaded ${row.channel_name || row.channel_id} ${row.period_key}`,
      "log"
    );
    return true;
  }

  async uploadFile(store, absolutePath, row, guildId) {
    let operation = await this.ai().fileSearchStores.uploadToFileSearchStore({
      fileSearchStoreName: store,
      file: absolutePath,
      config: {
        mimeType: "text/plain",
        displayName: documentDisplayName(row),
        customMetadata: metadataFor(row, guildId),
        chunkingConfig: {
          whiteSpaceConfig: {
            maxTokensPerChunk: 400,
            maxOverlapTokens: 40,
          },
        },
      },
    });

    for (let i = 0; i < MAX_POLLS && !operation.done; i++) {
      await this.client.wait(POLL_MS);
      operation = await this.ai().operations.get({ operation });
    }

    if (!operation.done) {
      throw new Error(`File Search upload timed out for ${row.period_key}`);
    }
    if (operation.error) {
      const detail = operation.error.message || JSON.stringify(operation.error);
      throw new Error(`File Search upload failed: ${detail}`);
    }

    const documentName = operation.response?.documentName;
    if (!documentName) {
      throw new Error(`File Search upload returned no document name for ${row.period_key}`);
    }
    return documentName;
  }

  async deleteDocuments(db, rows) {
    const store = db.getFileSearchStore();
    if (!store) return;
    for (const row of rows) {
      if (!row.file_search_document_id) continue;
      await this.deleteDocument(store, row.file_search_document_id);
    }
  }

  async deleteDocument(store, documentName) {
    try {
      await this.ai().fileSearchStores.documents.delete({
        name: documentName,
        config: { force: true },
      });
    } catch (error) {
      const message = error.message || String(error);
      if (/NOT_FOUND|404|not found/i.test(message)) return;
      this.client.logger.log(error, "warn");
    }
  }
}

module.exports = { createChatFileSearch };
