const sqlite = require('better-sqlite3')
const {v1: uuid} = require('uuid')
const natural = require('natural')
const _ = require('lodash')
var weighted = require('weighted')

const startWord = String.fromCharCode(0x0002)
const endWord = String.fromCharCode(0x0003)

class Database {
    constructor(guildid){
        if (process.env.IS_ON_FLY) {
            this.db = new sqlite(`/data/${guildid}.sqlite`)
        } else {
            this.db = new sqlite(`./data/${guildid}.sqlite`)
        }

        //DB INIT SECTION
        //Markov Chains
        this.db.prepare("CREATE TABLE IF NOT EXISTS bigram (id TEXT PRIMARY KEY NOT NULL, word1 TEXT, word2 TEXT, count INT)").run()
        this.db.prepare("CREATE TABLE IF NOT EXISTS trigram (id TEXT PRIMARY KEY NOT NULL, word1 TEXT, word2 TEXT, word3 TEXT, count INT)").run()
        this.db.prepare("CREATE TABLE IF NOT EXISTS quadgram (id TEXT PRIMARY KEY NOT NULL, word1 TEXT, word2 TEXT, word3 TEXT, word4 TEXT, count INT)").run()
        this.db.prepare("CREATE TABLE IF NOT EXISTS quingram (id TEXT PRIMARY KEY NOT NULL, word1 TEXT, word2 TEXT, word3 TEXT, word4 TEXT, word5 TEXT, count INT)").run()
        this.db.prepare("CREATE TABLE IF NOT EXISTS wordcount (id int PRIMARY KEY NOT NULL, Count Int)").run()
        this.db.prepare("CREATE TABLE IF NOT EXISTS sentcount (id int PRIMARY KEY NOT NULL, Count Int)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS quingram_words ON quingram (word1, word2, word3, word4, word5)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS quingram_forward ON quingram (word1, word2, word3, word4)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS quingram_backward ON quingram (word2, word3, word4, word5)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS quadgram_words ON quadgram (word1, word2, word3, word4)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS quadgram_forward ON quadgram (word1, word2, word3)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS quadgram_backward ON quadgram (word2, word3, word4)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS trigram_words ON trigram (word1, word2, word3)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS trigram_forward ON trigram (word1, word2)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS trigram_backward ON trigram (word2, word3)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS bigram_words ON bigram (word1, word2)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS bigram_forward ON bigram (word1)").run()
        this.db.prepare("CREATE INDEX IF NOT EXISTS bigram_backward ON bigram (word2)").run()
        //Starboard
        this.db.prepare("CREATE TABLE IF NOT EXISTS starboard (_id INTEGER PRIMARY KEY AUTOINCREMENT, message VARCHAR(500) NOT NULL, starMessage VARCHAR(500) NOT NULL, startype VARCHAR(500))").run()
        this.db.prepare('CREATE INDEX IF NOT EXISTS idx_starboard_message on starboard(message, startype)').run()
        this.db.prepare('CREATE INDEX IF NOT EXISTS idx_starboard_starmessage on starboard(starmessage)').run()
        // Real names (Phase 1b): stable id → name map for chat understanding
        this.db.prepare("CREATE TABLE IF NOT EXISTS people (user_id TEXT PRIMARY KEY, real_name TEXT NOT NULL)").run()
        this.db.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          is_bot INTEGER NOT NULL DEFAULT 0
        )`).run()
        this.db.prepare('CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created ON chat_messages (channel_id, created_at)').run()
        this.db.prepare(`CREATE TABLE IF NOT EXISTS backfill_state (
          channel_id TEXT PRIMARY KEY,
          oldest_id_seen TEXT,
          newest_id_seen TEXT,
          status TEXT NOT NULL,
          messages_stored INTEGER NOT NULL DEFAULT 0,
          last_run_at INTEGER,
          last_error TEXT
        )`).run()
        this.db.prepare(`CREATE TABLE IF NOT EXISTS backfill_worker (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL,
          priority_channel_id TEXT,
          updated_at INTEGER
        )`).run()
        this.db.prepare("INSERT OR IGNORE INTO backfill_worker (id, status, updated_at) VALUES (1, 'paused', NULL)").run()
        for (const sql of [
            "ALTER TABLE backfill_state ADD COLUMN kind TEXT NOT NULL DEFAULT 'channel'",
            "ALTER TABLE backfill_state ADD COLUMN threads_synced INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE backfill_state ADD COLUMN thread_archive_before TEXT",
            "ALTER TABLE backfill_state ADD COLUMN thread_archive_kind TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN compile_channel_id TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN compile_period_key TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN compile_period_type TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN file_search_store TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN last_tick_at INTEGER",
            "ALTER TABLE backfill_worker ADD COLUMN last_upload_error TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN upload_channel_id TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN upload_period_key TEXT",
            "ALTER TABLE backfill_worker ADD COLUMN upload_period_type TEXT",
        ]) {
            try { this.db.prepare(sql).run() } catch {}
        }
        this.db.prepare(`CREATE TABLE IF NOT EXISTS transcript_exports (
          channel_id TEXT NOT NULL,
          period_type TEXT NOT NULL,
          period_key TEXT NOT NULL,
          path TEXT NOT NULL,
          channel_name TEXT,
          parent_channel_id TEXT,
          parent_channel_name TEXT,
          kind TEXT,
          start_at INTEGER NOT NULL,
          end_at INTEGER NOT NULL,
          message_count INTEGER NOT NULL,
          compiled_at INTEGER NOT NULL,
          PRIMARY KEY (channel_id, period_type, period_key)
        )`).run()
        this.db.prepare('CREATE INDEX IF NOT EXISTS idx_transcript_exports_period ON transcript_exports (period_type, period_key)').run()
        for (const sql of [
            "ALTER TABLE transcript_exports ADD COLUMN file_search_document_id TEXT",
            "ALTER TABLE transcript_exports ADD COLUMN uploaded_at INTEGER",
            "ALTER TABLE transcript_exports ADD COLUMN uploaded_message_count INTEGER",
            "ALTER TABLE transcript_exports ADD COLUMN file_search_operation TEXT",
        ]) {
            try { this.db.prepare(sql).run() } catch {}
        }

        try {
            this.db.prepare('INSERT INTO wordcount VALUES (1,0)').run()
            this.db.prepare('INSERT INTO wordcount VALUES (2,0)').run()
            this.db.prepare('INSERT INTO wordcount VALUES (3,0)').run()
            this.db.prepare('INSERT INTO wordcount VALUES (4,0)').run()
            this.db.prepare('INSERT INTO wordcount VALUES (5,0)').run()
            this.db.prepare('INSERT INTO wordcount VALUES (6,0)').run()
        } catch {}
        try {
            this.db.prepare('INSERT INTO sentcount VALUES (1,0)').run()
            this.db.prepare('INSERT INTO sentcount VALUES (2,0)').run()
            this.db.prepare('INSERT INTO sentcount VALUES (3,0)').run()
            this.db.prepare('INSERT INTO sentcount VALUES (4,0)').run()
            this.db.prepare('INSERT INTO sentcount VALUES (5,0)').run()
            this.db.prepare('INSERT INTO sentcount VALUES (6,0)').run()
            this.db.prepare('INSERT INTO sentcount VALUES (7,0)').run()
            this.db.prepare('INSERT INTO sentcount VALUES (8,0)').run()
        } catch {}
        //END DB INIT SECION

        //Commands
        //Markov
        this.selectWCount = this.db.prepare('SELECT * FROM wordcount')
        this.selectSCount = this.db.prepare('SELECT * FROM sentcount')
        this.addWCount = this.db.prepare('UPDATE wordcount SET count = count + 1 WHERE id = :id')
        this.addSCount = this.db.prepare('UPDATE sentcount SET count = count + 1 WHERE id = :id')
        this.insertquingram = this.db.prepare('INSERT INTO quingram VALUES (:id, :word1, :word2, :word3, :word4, :word5, 1)')
        this.insertquadgram = this.db.prepare('INSERT INTO quadgram VALUES (:id, :word1, :word2, :word3, :word4, 1)')
        this.inserttrigram = this.db.prepare('INSERT INTO trigram VALUES (:id, :word1, :word2, :word3, 1)')
        this.insertbigram = this.db.prepare('INSERT INTO bigram VALUES (:id, :word1, :word2, 1)')
        this.addquingram = this.db.prepare('UPDATE quingram SET count = count + 1 WHERE id = :id')
        this.addquadgram = this.db.prepare('UPDATE quadgram SET count = count + 1 WHERE id = :id')
        this.addtrigram = this.db.prepare('UPDATE trigram SET count = count + 1 WHERE id = :id')
        this.addbigram = this.db.prepare('UPDATE bigram SET count = count + 1 WHERE id = :id')
        this.selectquingramwords = this.db.prepare('SELECT * FROM quingram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 AND word4 = :word4 AND word5 = :word5')
        this.selectquadgramwords = this.db.prepare('SELECT * FROM quadgram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 AND word4 = :word4')
        this.selecttrigramwords = this.db.prepare('SELECT * FROM trigram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3')
        this.selectbigramwords = this.db.prepare('SELECT * FROM bigram WHERE word1 = :word1 AND word2 = :word2')
        this.forwardquingramwords = this.db.prepare('SELECT word5 as nextword, count FROM quingram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 AND word4 = :word4 ')
        this.forwardquadgramwords = this.db.prepare('SELECT word4 as nextword, count FROM quadgram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 ')
        this.forwardtrigramwords = this.db.prepare('SELECT word3 as nextword, count FROM trigram WHERE word1 = :word1 AND word2 = :word2 ')
        this.forwardbigramwords = this.db.prepare('SELECT word2 as nextword, count FROM bigram WHERE word1 = :word1 ')
        this.backwardquingramwords = this.db.prepare('SELECT word1, count FROM quingram WHERE word2 = :word2 AND word3 = :word3 AND word4 = :word4 AND word5 = :word5')
        this.backwardquadgramwords = this.db.prepare('SELECT word1, count FROM quadgram WHERE word2 = :word2 AND word3 = :word3 AND word4 = :word4')
        this.backwardtrigramwords = this.db.prepare('SELECT word1, count FROM trigram WHERE word2 = :word2 AND word3 = :word3')
        this.backwardbigramwords = this.db.prepare('SELECT word1, count FROM bigram WHERE word2 = :word2')
        this.randomquingram = this.db.prepare('SELECT * FROM quingram ORDER BY RANDOM() LIMIT 1')
        this.randomquingramstart = this.db.prepare('SELECT * FROM quingram WHERE word1 = :word1 AND word2 = :word2 ORDER BY RANDOM() LIMIT 1')
        this.randomquadgram = this.db.prepare('SELECT * FROM quadgram ORDER BY RANDOM() LIMIT 1')
        this.randomquadgramstart = this.db.prepare('SELECT * FROM quadgram WHERE word1 = :word1 AND word2 = :word2 ORDER BY RANDOM() LIMIT 1')
        this.randomtrigram = this.db.prepare('SELECT * FROM trigram ORDER BY RANDOM() LIMIT 1')
        this.randomtrigramstart = this.db.prepare('SELECT * FROM trigram WHERE word1 = :word1 AND word2 = :word2 ORDER BY RANDOM() LIMIT 1')
        this.randombigram = this.db.prepare('SELECT * FROM bigram ORDER BY RANDOM() LIMIT 1')
        //starboard
        this.starFind = this.db.prepare('SELECT * FROM starboard WHERE message = ? AND startype = ?')
        
        this.starAdd = this.db.prepare(
            'INSERT INTO starboard (message, starMessage, startype) VALUES (@message, @starMessage, @startype)'
          )
        this.starDelete = this.db.prepare('DELETE FROM starboard WHERE starMessage = ?')
        this.upsertPerson = this.db.prepare(
            'INSERT INTO people (user_id, real_name) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET real_name = excluded.real_name'
        )
        this.selectPerson = this.db.prepare('SELECT real_name FROM people WHERE user_id = ?')
        this.selectPeople = this.db.prepare('SELECT user_id, real_name FROM people ORDER BY real_name COLLATE NOCASE')
        this.deletePerson = this.db.prepare('DELETE FROM people WHERE user_id = ?')
        this.insertChatMessageStmt = this.db.prepare(
            'INSERT OR IGNORE INTO chat_messages (id, channel_id, author_id, author_name, content, created_at, is_bot) VALUES (@id, @channel_id, @author_id, @author_name, @content, @created_at, @is_bot)'
        )
        this.insertChatMessagesTxn = this.db.transaction((rows) => {
            let added = 0
            for (const row of rows) {
                added += this.insertChatMessageStmt.run(row).changes
            }
            return added
        })
        this.commitBackfillPageTxn = this.db.transaction((rows, progress) => {
            let added = 0
            for (const row of rows) {
                added += this.insertChatMessageStmt.run(row).changes
            }
            this.updateBackfillProgressStmt.run({
                ...progress,
                added,
                last_run_at: Date.now(),
            })
            return added
        })
        this.selectChatMessageCreatedAt = this.db.prepare('SELECT created_at FROM chat_messages WHERE id = ?')
        this.ensureBackfillStateStmt = this.db.prepare(
            "INSERT OR IGNORE INTO backfill_state (channel_id, oldest_id_seen, newest_id_seen, status, messages_stored, last_run_at, last_error, kind, threads_synced) VALUES (@channel_id, NULL, NULL, @status, 0, NULL, NULL, @kind, @threads_synced)"
        )
        this.selectBackfillState = this.db.prepare('SELECT * FROM backfill_state WHERE channel_id = ?')
        this.selectAllBackfillState = this.db.prepare('SELECT * FROM backfill_state ORDER BY status, channel_id')
        this.selectNextBackfillChannel = this.db.prepare(`
            SELECT * FROM backfill_state
            WHERE status IN ('pending', 'running', 'discovering')
            ORDER BY CASE WHEN channel_id = ? THEN 0 ELSE 1 END,
                     CASE status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 WHEN 'discovering' THEN 2 ELSE 3 END,
                     channel_id
            LIMIT 1
        `)
        this.selectBackfillSummary = this.db.prepare(`
            SELECT
              COUNT(*) as queued,
              COALESCE(SUM(CASE WHEN COALESCE(kind, 'channel') = 'thread' THEN 1 ELSE 0 END), 0) as threads,
              COALESCE(SUM(CASE WHEN COALESCE(kind, 'channel') != 'thread' THEN 1 ELSE 0 END), 0) as channels,
              COALESCE(SUM(messages_stored), 0) as messages,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
              COALESCE(SUM(CASE WHEN status IN ('running', 'discovering') THEN 1 ELSE 0 END), 0) as in_progress,
              COALESCE(SUM(CASE WHEN status = 'caught_up' THEN 1 ELSE 0 END), 0) as caught_up,
              COALESCE(SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END), 0) as skipped,
              COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as error
            FROM backfill_state
        `)
        this.selectRunningBackfill = this.db.prepare(`
            SELECT * FROM backfill_state
            WHERE status IN ('running', 'discovering')
            ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, last_run_at DESC
            LIMIT 1
        `)
        this.selectDiscoveringBackfill = this.db.prepare(`
            SELECT * FROM backfill_state WHERE status = 'discovering' LIMIT 1
        `)
        this.updateThreadDiscoveryStmt = this.db.prepare(`
            UPDATE backfill_state SET
              thread_archive_before = @thread_archive_before,
              thread_archive_kind = @thread_archive_kind,
              threads_synced = @threads_synced,
              status = @status,
              last_run_at = @last_run_at,
              last_error = NULL
            WHERE channel_id = @channel_id
        `)
        this.updateBackfillProgressStmt = this.db.prepare(`
            UPDATE backfill_state SET
              oldest_id_seen = @oldest_id_seen,
              newest_id_seen = COALESCE(newest_id_seen, @newest_id_seen),
              status = @status,
              messages_stored = messages_stored + @added,
              last_run_at = @last_run_at,
              last_error = @last_error
            WHERE channel_id = @channel_id
        `)
        this.setBackfillChannelStatusStmt = this.db.prepare(`
            UPDATE backfill_state SET status = ?, last_error = ?, last_run_at = ? WHERE channel_id = ?
        `)
        this.selectBackfillWorker = this.db.prepare('SELECT * FROM backfill_worker WHERE id = 1')
        this.setBackfillWorkerStatusStmt = this.db.prepare(
            'UPDATE backfill_worker SET status = ?, updated_at = ? WHERE id = 1'
        )
        this.setBackfillPriorityStmt = this.db.prepare(
            'UPDATE backfill_worker SET priority_channel_id = ?, updated_at = ? WHERE id = 1'
        )
        this.resetBackfillErrorsStmt = this.db.prepare(
            "UPDATE backfill_state SET status = 'pending', last_error = NULL, last_run_at = ? WHERE status = 'error'"
        )
        this.setCompileProgressStmt = this.db.prepare(
            "UPDATE backfill_worker SET compile_channel_id = ?, compile_period_key = ?, compile_period_type = ?, updated_at = ? WHERE id = 1"
        )
        this.selectChannelMonthCounts = this.db.prepare(`
            SELECT channel_id,
                   strftime('%Y-%m', created_at / 1000, 'unixepoch') as period_key,
                   COUNT(*) as message_count
            FROM chat_messages
            GROUP BY channel_id, period_key
            ORDER BY channel_id, period_key
        `)
        this.selectChannelWeekCounts = this.db.prepare(`
            SELECT ((CAST(strftime('%d', created_at / 1000, 'unixepoch') AS INTEGER) - 1) / 7) + 1 as week,
                   COUNT(*) as message_count
            FROM chat_messages
            WHERE channel_id = ? AND created_at >= ? AND created_at < ?
            GROUP BY week
            ORDER BY week
        `)
        this.selectMessagesInRange = this.db.prepare(`
            SELECT id, channel_id, author_id, author_name, content, created_at, is_bot
            FROM chat_messages
            WHERE channel_id = ? AND created_at >= ? AND created_at < ?
            ORDER BY created_at ASC, id ASC
        `)
        this.selectTranscriptExport = this.db.prepare(
            "SELECT * FROM transcript_exports WHERE channel_id = ? AND period_type = ? AND period_key = ?"
        )
        this.upsertTranscriptExportStmt = this.db.prepare(`
            INSERT INTO transcript_exports (
              channel_id, period_type, period_key, path, channel_name, parent_channel_id,
              parent_channel_name, kind, start_at, end_at, message_count, compiled_at
            ) VALUES (
              @channel_id, @period_type, @period_key, @path, @channel_name, @parent_channel_id,
              @parent_channel_name, @kind, @start_at, @end_at, @message_count, @compiled_at
            )
            ON CONFLICT(channel_id, period_type, period_key) DO UPDATE SET
              path = excluded.path,
              channel_name = excluded.channel_name,
              parent_channel_id = excluded.parent_channel_id,
              parent_channel_name = excluded.parent_channel_name,
              kind = excluded.kind,
              start_at = excluded.start_at,
              end_at = excluded.end_at,
              message_count = excluded.message_count,
              compiled_at = excluded.compiled_at
        `)
        this.selectTranscriptWeeksForMonth = this.db.prepare(
            "SELECT * FROM transcript_exports WHERE channel_id = ? AND period_type = 'week' AND period_key LIKE ?"
        )
        this.deleteTranscriptWeeksForMonthStmt = this.db.prepare(
            "DELETE FROM transcript_exports WHERE channel_id = ? AND period_type = 'week' AND period_key LIKE ?"
        )
        this.selectTranscriptSummary = this.db.prepare(`
            SELECT
              COALESCE(SUM(CASE WHEN period_type = 'month' THEN 1 ELSE 0 END), 0) as months,
              COALESCE(SUM(CASE WHEN period_type = 'week' THEN 1 ELSE 0 END), 0) as weeks,
              COALESCE(SUM(message_count), 0) as messages,
              COALESCE(SUM(CASE WHEN file_search_document_id IS NOT NULL AND file_search_document_id != '' THEN 1 ELSE 0 END), 0) as uploaded
            FROM transcript_exports
        `)
        this.selectPendingTranscriptUpload = this.db.prepare(`
            SELECT * FROM transcript_exports
            WHERE path IS NOT NULL AND path != ''
              AND (
                (file_search_operation IS NOT NULL AND file_search_operation != '')
                OR IFNULL(uploaded_message_count, -1) != message_count
                OR (
                  (file_search_document_id IS NULL OR file_search_document_id = '')
                  AND uploaded_at IS NULL
                )
              )
            ORDER BY period_key, channel_id
            LIMIT 1
        `)
        this.markTranscriptUploadedStmt = this.db.prepare(`
            UPDATE transcript_exports SET
              file_search_document_id = ?,
              file_search_operation = NULL,
              uploaded_at = ?,
              uploaded_message_count = message_count
            WHERE channel_id = ? AND period_type = ? AND period_key = ?
        `)
        this.setTranscriptUploadOperationStmt = this.db.prepare(`
            UPDATE transcript_exports SET file_search_operation = ?
            WHERE channel_id = ? AND period_type = ? AND period_key = ?
        `)
        this.markTranscriptUploadSkippedStmt = this.db.prepare(`
            UPDATE transcript_exports SET
              uploaded_at = ?,
              uploaded_message_count = message_count,
              file_search_operation = NULL
            WHERE channel_id = ? AND period_type = ? AND period_key = ?
        `)
        this.setFileSearchStoreStmt = this.db.prepare(
            "UPDATE backfill_worker SET file_search_store = ?, updated_at = ? WHERE id = 1"
        )
        this.setLastTickAtStmt = this.db.prepare(
            "UPDATE backfill_worker SET last_tick_at = ?, updated_at = ? WHERE id = 1"
        )
        this.setLastUploadErrorStmt = this.db.prepare(
            "UPDATE backfill_worker SET last_upload_error = ?, updated_at = ? WHERE id = 1"
        )
        this.setUploadProgressStmt = this.db.prepare(
            "UPDATE backfill_worker SET upload_channel_id = ?, upload_period_key = ?, upload_period_type = ?, updated_at = ? WHERE id = 1"
        )
    }

    makeSentence(ngramLength, startWithWord){
        switch(ngramLength){
            case "2": //not doing bigrams
            case "3":
                this.RandoSelect = this.randomtrigram
                this.RandoSelectStart = this.randomtrigramstart
                this.goForth = this.forwardtrigramwords
                this.goBack = this.backwardtrigramwords
                this.backCount = 2
                break
            case "5":
                this.RandoSelect = this.randomquingram
                this.RandoSelectStart = this.randomquingramstart
                this.goForth = this.forwardquingramwords
                this.goBack = this.backwardquingramwords
                this.backCount = 4
                break
            case "4":
            default:
                this.RandoSelect = this.randomquadgram
                this.RandoSelectStart = this.randomquadgramstart
                this.goForth = this.forwardquadgramwords
                this.goBack = this.backwardquadgramwords
                this.backCount = 3
                break;
        }
        return this.SayThings(startWithWord)
    }

    SayThings(startWithWord){
        var sentencesFromDB = this.selectSCount.all()
        var wordsFromDB = this.selectWCount.all()

        var sentenceCounts = sentencesFromDB.map(s => s.Count)
        var sentenceIds = sentencesFromDB.map(s => s.id)
        var wordCounts = wordsFromDB.map(s => s.Count)
        var wordIds = wordsFromDB.map(s => s.id)

        var sayThisManyS = 1; // Default
        if (sentenceIds.length > 0 && sentenceCounts.reduce((sum, w) => sum + w, 0) >= 1) {
            try {
                sayThisManyS = weighted.select(sentenceIds, sentenceCounts);
            } catch (e) {
                console.error("Error selecting number of sentences, defaulting to 1. IDs:", sentenceIds, "Counts:", sentenceCounts, "Error:", e);
                sayThisManyS = 1;
            }
        } else if (sentenceIds.length > 0) {
            // If IDs exist but counts sum to < 1 (e.g. all zeros), default to 1 sentence.
            // Or, could pick a random ID if desired, but weighted.select would fail.
            console.warn("Sentence counts sum to < 1 or no sentences with count > 0. Defaulting to 1 sentence. IDs:", sentenceIds, "Counts:", sentenceCounts);
            sayThisManyS = 1;
        } else {
            // No sentence entries in DB at all
            console.warn("No sentence count entries found in DB. Defaulting to 1 sentence.");
            sayThisManyS = 1;
        }


        var sayThisManyW = 1; // Default
        if (wordIds.length > 0 && wordCounts.reduce((sum, w) => sum + w, 0) >= 1) {
            try {
                sayThisManyW = weighted.select(wordIds, wordCounts);
            } catch (e) {
                console.error("Error selecting number of words, defaulting to 1. IDs:", wordIds, "Counts:", wordCounts, "Error:", e);
                sayThisManyW = 1;
            }
        } else if (wordIds.length > 0) {
            // If IDs exist but counts sum to < 1
            console.warn("Word counts sum to < 1 or no words with count > 0. Defaulting to 1 word (for length check). IDs:", wordIds, "Counts:", wordCounts);
            sayThisManyW = 1; // This is a target, not a strict minimum for the first sentence.
        } else {
            // No word entries in DB
            console.warn("No word count entries found in DB. Defaulting to 1 word (for length check).");
            sayThisManyW = 1;
        }

        var wholeResponse = ""
        for(var i=0;i<sayThisManyS;i++){
            if (i > 0) { 
                wholeResponse += '\n'
                wholeResponse += this.BuildSentence()
            } else {
                wholeResponse += this.BuildSentence(startWithWord)
            }
        }
        if (wholeResponse.split(' ').length < sayThisManyW){
            wholeResponse += '\n'
            wholeResponse += this.BuildSentence()
        } 
        return wholeResponse
    }

    BuildSentence(startWithWord){
        var randomStart
        if (startWord) {
            randomStart = this.RandoSelectStart.get({word1: startWord, word2: startWithWord})
            if (randomStart === undefined) randomStart = this.RandoSelect.get()
        } else {
            randomStart = this.RandoSelect.get()
        }
        if (randomStart === undefined) return ''
        var newSentence = [randomStart.word1, randomStart.word2, randomStart.word3]
        if (randomStart.word4) newSentence.push(randomStart.word4)
        if (randomStart.word5) newSentence.push(randomStart.word5)
        this.backThatAssUp(newSentence)
        this.goForthAndMultipy(newSentence)
        return this.filter(newSentence)
    }

    backThatAssUp(sentence){
        if (sentence[0] === startWord) return
        var nextResult = this.goBack.all({word2: sentence[0], word3: sentence[1], word4: sentence[2], word5: sentence[3]})

        if (!nextResult || nextResult.length === 0) return

        var items = nextResult.map(s => s.word1)
        var weights = nextResult.map(s => s.count)

        if (items.length === 0 || weights.reduce((sum, w) => sum + w, 0) < 1) {
            return;
        }

        try {
            var nextw = weighted.select(items, weights)
            sentence.splice(0,0,nextw)
            this.backThatAssUp(sentence)
        } catch (e) {
            console.error("Error in backThatAssUp during weighted.select. Items:", items, "Weights:", weights, "Error:", e);
            return; // Stop recursion if error occurs
        }
    }
    goForthAndMultipy(sentence){
        if (sentence[sentence.length-1] === endWord) return
        var lastFour = sentence.slice((-1 * this.backCount))
        var nextResult = this.goForth.all({word1: lastFour[0], word2: lastFour[1], word3: lastFour[2], word4: lastFour[3]})

        if (!nextResult || nextResult.length === 0) return

        var items = nextResult.map(s => s.nextword)
        var weights = nextResult.map(s => s.count)

        if (items.length === 0 || weights.reduce((sum, w) => sum + w, 0) < 1) {
            return;
        }

        try {
            var nextw = weighted.select(items, weights)
            sentence.push(nextw)
            this.goForthAndMultipy(sentence)
        } catch (e) {
            console.error("Error in goForthAndMultipy during weighted.select. Items:", items, "Weights:", weights, "Error:", e);
            return; // Stop recursion if error occurs
        }
    }

    filter(currentSentence) {
        while(currentSentence[0] === startWord) { currentSentence.shift() }
        while(currentSentence[currentSentence.length-1] === endWord) { currentSentence.pop() }
        var sentence = currentSentence.join(' ')
        var cleaned = sentence.replace(/```/g,'').replace(/\s([!.?:;,”’])/g, '$1').replace(/\s(['"“])\s/g, '$1')
        return cleaned
    }

    markovInput(allText){
        var sentences = _.without(allText.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s/g),'',' ')
        this.updateSCount(sentences.length)
        _.forEach(sentences, sentence => this.markovInsert(sentence))
    }

    markovInsert(words) {
        //var splits = words.split(/((?:(?:https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(?:[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9-\u21AA\u231A-\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614-\u2615\u2618\u261D\u2620\u2622-\u2623\u2626\u262A\u262E-\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u2660\u2663\u2665-\u2666\u2668\u267B\u267F\u2692-\u2697\u2699\u269B-\u269C\u26A0-\u26A1\u26AA-\u26AB\u26B0-\u26B1\u26BD-\u26BE\u26C4-\u26C5\u26C8\u26CE-\u26CF\u26D1\u26D3-\u26D4\u26E9-\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733-\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763-\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|(?:\uD83C[\uDC04\uDCCF\uDD70-\uDD71\uDD7E-\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01-\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50-\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96-\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F-\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95-\uDD96\uDDA4-\uDDA5\uDDA8\uDDB1-\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDEE0-\uDEE5\uDEE9\uDEEB-\uDEEC\uDEF0\uDEF3-\uDEF6]|\uD83E[\uDD10-\uDD1E\uDD20-\uDD27\uDD30\uDD33-\uDD3A\uDD3C-\uDD3E\uDD40-\uDD45\uDD47-\uDD4B\uDD50-\uDD5E\uDD80-\uDD91\uDDC0]))|<.?:[A-zÀ-ÿ-]+:[0-9]+>|<[@#]!?\d+>|[A-zÀ-ÿ-]+|[0-9._]+|.|!|\?|'|"|:|;|,|-)/i)
        var splits = words.split(/((?:(?:https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(?:[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9-\u21AA\u231A-\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614-\u2615\u2618\u261D\u2620\u2622-\u2623\u2626\u262A\u262E-\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u2660\u2663\u2665-\u2666\u2668\u267B\u267F\u2692-\u2697\u2699\u269B-\u269C\u26A0-\u26A1\u26AA-\u26AB\u26B0-\u26B1\u26BD-\u26BE\u26C4-\u26C5\u26C8\u26CE-\u26CF\u26D1\u26D3-\u26D4\u26E9-\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733-\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763-\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|(?:\uD83C[\uDC04\uDCCF\uDD70-\uDD71\uDD7E-\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01-\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50-\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96-\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F-\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95-\uDD96\uDDA4-\uDDA5\uDDA8\uDDB1-\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDEE0-\uDEE5\uDEE9\uDEEB-\uDEEC\uDEF0\uDEF3-\uDEF6]|\uD83E[\uDD10-\uDD1E\uDD20-\uDD27\uDD30\uDD33-\uDD3A\uDD3C-\uDD3E\uDD40-\uDD45\uDD47-\uDD4B\uDD50-\uDD5E\uDD80-\uDD91\uDDC0]))|<.?:[A-zÀ-ÿ-]+:[0-9]+>|<[@#]!?\d+>|\|\||[A-zÀ-ÿ-]+|[0-9._]+|.|!|\?|'|"|:|;|,|-)/i)
        var tokenizered = _.without(splits,'',' ')
        this.updateWCount(tokenizered.length)
        var NGrams = natural.NGrams
        _.forEach(NGrams.ngrams(tokenizered,5,startWord,endWord), gram => this.quingramAddOrInsert([...gram, endWord, endWord, endWord]))
        _.forEach(NGrams.ngrams(tokenizered,4,startWord,endWord), gram => this.quadgramAddOrInsert([...gram, endWord, endWord]))
        _.forEach(NGrams.ngrams(tokenizered,3,startWord,endWord), gram => this.trigramAddOrInsert([...gram, endWord]))
        //_.forEach(NGrams.ngrams(words,2,startWord,endWord), gram => this.bigramAddOrInsert(gram))
    }

    quingramAddOrInsert(quin){
        var exists = this.selectquingramwords.get({word1: quin[0], word2: quin[1], word3: quin[2], word4: quin[3], word5: quin[4]})
        if (exists === undefined) this.insertquingram.run({id: uuid(), word1: quin[0], word2: quin[1], word3: quin[2], word4: quin[3], word5: quin[4]})
        else this.addquingram.run({id: exists.id})
    }
    quadgramAddOrInsert(quad){
        var exists = this.selectquadgramwords.get({word1: quad[0], word2: quad[1], word3: quad[2], word4: quad[3]})
        if (exists === undefined) this.insertquadgram.run({id: uuid(), word1: quad[0], word2: quad[1], word3: quad[2], word4: quad[3]})
        else this.addquadgram.run({id: exists.id})
    }
    trigramAddOrInsert(tri){
        var exists = this.selecttrigramwords.get({word1: tri[0], word2: tri[1], word3: tri[2]})
        if (exists === undefined) this.inserttrigram.run({id: uuid(), word1: tri[0], word2: tri[1], word3: tri[2]})
        else this.addtrigram.run({id: exists.id})
    }
    bigramAddOrInsert(bi){
        var exists = this.selectbigramwords.get({word1: bi[0], word2: bi[1]})
        if (exists === undefined) this.insertbigram.run({id: uuid(), word1: bi[0], word2: bi[1]})
        else this.addbigram.run({id: exists.id})
    }

    updateWCount(len) {
        if (len > 6) this.addWCount.run({id: 6})
        else this.addWCount.run({id: len})
    }

    updateSCount(len) {
        if (len > 8) this.addSCount.run({id: 8})
        else this.addSCount.run({id: len})
    }

    starboardFind(messageId, emoji) {
        const msg = this.starFind.get(messageId, emoji);
        return msg;
    }

    starboardAdd(values){
        this.starAdd.run(values)
    }

    starboardDelete(starMessageId) {
        this.starDelete.run(starMessageId)
    }

    setPersonName(userId, realName) {
        this.upsertPerson.run(userId, realName)
    }

    getPersonName(userId) {
        const row = this.selectPerson.get(userId)
        return row ? row.real_name : null
    }

    listPeople() {
        return this.selectPeople.all()
    }

    getPeopleMap() {
        const map = new Map()
        for (const row of this.selectPeople.all()) {
            map.set(row.user_id, row.real_name)
        }
        return map
    }

    clearPersonName(userId) {
        return this.deletePerson.run(userId).changes > 0
    }

    insertChatMessage(row) {
        this.insertChatMessageStmt.run(row)
    }

    insertChatMessages(rows) {
        if (!rows.length) return 0
        return this.insertChatMessagesTxn(rows)
    }

    commitBackfillPage(rows, progress) {
        return this.commitBackfillPageTxn(rows, progress)
    }

    resetBackfillErrors() {
        this.resetBackfillErrorsStmt.run(Date.now())
    }

    getChatMessageCreatedAt(id) {
        if (!id) return null
        const row = this.selectChatMessageCreatedAt.get(id)
        return row ? row.created_at : null
    }

    ensureBackfillChannel(channelId, status, { kind = "channel", threads_synced = 0 } = {}) {
        this.ensureBackfillStateStmt.run({ channel_id: channelId, status, kind, threads_synced })
    }

    getBackfillSummary() {
        return this.selectBackfillSummary.get()
    }

    getRunningBackfill() {
        return this.selectRunningBackfill.get() || null
    }

    getDiscoveringBackfill() {
        return this.selectDiscoveringBackfill.get() || null
    }

    updateThreadDiscovery({ channel_id, thread_archive_before, thread_archive_kind, threads_synced, status }) {
        this.updateThreadDiscoveryStmt.run({
            channel_id,
            thread_archive_before,
            thread_archive_kind,
            threads_synced,
            status,
            last_run_at: Date.now(),
        })
    }

    getBackfillState(channelId) {
        return this.selectBackfillState.get(channelId) || null
    }

    listBackfillState() {
        return this.selectAllBackfillState.all()
    }

    getNextBackfillChannel(priorityChannelId) {
        return this.selectNextBackfillChannel.get(priorityChannelId || '') || null
    }

    updateBackfillProgress({ channel_id, oldest_id_seen, newest_id_seen, status, added, last_error }) {
        this.updateBackfillProgressStmt.run({
            channel_id,
            oldest_id_seen,
            newest_id_seen,
            status,
            added: added || 0,
            last_run_at: Date.now(),
            last_error,
        })
    }

    setBackfillChannelStatus(channelId, status, lastError = null) {
        this.setBackfillChannelStatusStmt.run(status, lastError, Date.now(), channelId)
    }

    getBackfillWorker() {
        return this.selectBackfillWorker.get() || { status: "paused", priority_channel_id: null }
    }

    setBackfillWorkerStatus(status) {
        this.setBackfillWorkerStatusStmt.run(status, Date.now())
    }

    setBackfillPriority(channelId) {
        this.setBackfillPriorityStmt.run(channelId, Date.now())
    }

    setCompileProgress({ channel_id = null, period_key = null, period_type = null } = {}) {
        this.setCompileProgressStmt.run(channel_id, period_key, period_type, Date.now())
    }

    listChannelMonthCounts() {
        return this.selectChannelMonthCounts.all()
    }

    listChannelWeekCounts(channelId, startAt, endAt) {
        return this.selectChannelWeekCounts.all(channelId, startAt, endAt)
    }

    listMessagesInRange(channelId, startAt, endAt) {
        return this.selectMessagesInRange.all(channelId, startAt, endAt)
    }

    getTranscriptExport(channelId, periodType, periodKey) {
        return this.selectTranscriptExport.get(channelId, periodType, periodKey) || null
    }

    upsertTranscriptExport(row) {
        this.upsertTranscriptExportStmt.run(row)
    }

    listTranscriptWeeksForMonth(channelId, monthKey) {
        return this.selectTranscriptWeeksForMonth.all(channelId, `${monthKey}-W%`)
    }

    deleteTranscriptWeeksForMonth(channelId, monthKey) {
        this.deleteTranscriptWeeksForMonthStmt.run(channelId, `${monthKey}-W%`)
    }

    getTranscriptSummary() {
        return this.selectTranscriptSummary.get()
    }

    getPendingTranscriptUpload() {
        return this.selectPendingTranscriptUpload.get() || null
    }

    markTranscriptUploaded(channelId, periodType, periodKey, documentId) {
        this.markTranscriptUploadedStmt.run(documentId, Date.now(), channelId, periodType, periodKey)
    }

    setTranscriptUploadOperation(channelId, periodType, periodKey, operationName) {
        this.setTranscriptUploadOperationStmt.run(operationName, channelId, periodType, periodKey)
    }

    markTranscriptUploadSkipped(channelId, periodType, periodKey) {
        this.markTranscriptUploadSkippedStmt.run(Date.now(), channelId, periodType, periodKey)
    }

    getFileSearchStore() {
        return this.getBackfillWorker().file_search_store || null
    }

    setFileSearchStore(name) {
        this.setFileSearchStoreStmt.run(name, Date.now())
    }

    setLastTickAt(ms) {
        this.setLastTickAtStmt.run(ms, Date.now())
    }

    setLastUploadError(message) {
        this.setLastUploadErrorStmt.run(message, Date.now())
    }

    setUploadProgress({ channel_id = null, period_key = null, period_type = null } = {}) {
        this.setUploadProgressStmt.run(channel_id, period_key, period_type, Date.now())
    }

    hasFileSearchReady() {
        const store = this.getFileSearchStore()
        if (!store) return false
        const summary = this.getTranscriptSummary()
        return Boolean(summary && summary.uploaded > 0)
    }

    hasBackfillCrawlWork() {
        return Boolean(this.getNextBackfillChannel(''))
    }

    top500Words() {
        // Table Structure: trigram (id TEXT PRIMARY KEY NOT NULL, word1 TEXT, word2 TEXT, word3 TEXT, count INT)
        // words 1,2,3 are words that have appeared in a row, and count is the number of times these 3 words have appeared in that order
        // This function runs a SQL query that returns the 500 most popular words used, excluding common English words and words with 3 or fewer characters

        const commonWords = [
            'the', 'of', 'to', 'and', 'a', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'with', 'as', 'I', 'his', 'they',
            'be', 'at', 'one', 'have', 'this', 'from', 'or', 'had', 'by', 'hot', 'but', 'some', 'what', 'there', 'we', 'can', 'out', 'other',
            'were', 'all', 'your', 'when', 'up', 'use', 'word', 'how', 'said', 'an', 'each', 'she', 'which', 'do', 'their', 'time', 'if',
            'will', 'way', 'about', 'many', 'then', 'them', 'would', 'write', 'like', 'so', 'these', 'her', 'long', 'make', 'thing', 'see',
            'him', 'two', 'has', 'look', 'more', 'day', 'could', 'go', 'come', 'did', 'my', 'sound', 'no', 'most', 'number', 'who', 'over',
            'know', 'water', 'than', 'call', 'first', 'people', 'may', 'down', 'side', 'been', 'now', 'find', 'any', 'new', 'work', 'part',
            'take', 'get', 'place', 'made', 'live', 'where', 'after', 'back', 'little', 'only', 'round', 'man', 'year', 'came', 'show',
            'every', 'good', 'me', 'give', 'our', 'under', 'name', 'very', 'through', 'just', 'form', 'much', 'great', 'think', 'say',
            'help', 'low', 'line', 'before', 'turn', 'cause', 'same', 'mean', 'differ', 'move', 'right', 'boy', 'old', 'too', 'does',
            'tell', 'sentence', 'set', 'three', 'want', 'air', 'well', 'also', 'play', 'small', 'end', 'put', 'home', 'read', 'hand',
            'port', 'large', 'spell', 'add', 'even', 'land', 'here', 'must', 'big', 'high', 'such', 'follow', 'act', 'why', 'ask',
            'men', 'change', 'went', 'light', 'kind', 'off', 'need', 'house', 'picture', 'try', 'us', 'again', 'animal'
        ].map(word => `'${word}'`).join(',');

        const query = `
            SELECT word, SUM(count) as total_count
            FROM (
                SELECT word1 as word, SUM(count) as count FROM trigram GROUP BY word1
                UNION ALL
                SELECT word2 as word, SUM(count) as count FROM trigram GROUP BY word2
                UNION ALL
                SELECT word3 as word, SUM(count) as count FROM trigram GROUP BY word3
            )
            WHERE LOWER(word) NOT IN (${commonWords})
            AND LENGTH(word) > 3
            GROUP BY word
            ORDER BY total_count DESC
            LIMIT 500
        `;
        
        return this.db.prepare(query).all();
    }

    top500WordPairs() {
        // This function runs a SQL query that returns the 500 most popular word pairs used,
        // excluding pairs containing common English words and words with 3 or fewer characters

        const commonWords = [
            'the', 'of', 'to', 'and', 'a', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'with', 'as', 'I', 'his', 'they',
            'be', 'at', 'one', 'have', 'this', 'from', 'or', 'had', 'by', 'hot', 'but', 'some', 'what', 'there', 'we', 'can', 'out', 'other',
            'were', 'all', 'your', 'when', 'up', 'use', 'word', 'how', 'said', 'an', 'each', 'she', 'which', 'do', 'their', 'time', 'if',
            'will', 'way', 'about', 'many', 'then', 'them', 'would', 'write', 'like', 'so', 'these', 'her', 'long', 'make', 'thing', 'see',
            'him', 'two', 'has', 'look', 'more', 'day', 'could', 'go', 'come', 'did', 'my', 'sound', 'no', 'most', 'number', 'who', 'over',
            'know', 'water', 'than', 'call', 'first', 'people', 'may', 'down', 'side', 'been', 'now', 'find', 'any', 'new', 'work', 'part',
            'take', 'get', 'place', 'made', 'live', 'where', 'after', 'back', 'little', 'only', 'round', 'man', 'year', 'came', 'show',
            'every', 'good', 'me', 'give', 'our', 'under', 'name', 'very', 'through', 'just', 'form', 'much', 'great', 'think', 'say',
            'help', 'low', 'line', 'before', 'turn', 'cause', 'same', 'mean', 'differ', 'move', 'right', 'boy', 'old', 'too', 'does',
            'tell', 'sentence', 'set', 'three', 'want', 'air', 'well', 'also', 'play', 'small', 'end', 'put', 'home', 'read', 'hand',
            'port', 'large', 'spell', 'add', 'even', 'land', 'here', 'must', 'big', 'high', 'such', 'follow', 'act', 'why', 'ask',
            'men', 'change', 'went', 'light', 'kind', 'off', 'need', 'house', 'picture', 'try', 'us', 'again', 'animal'
        ].map(word => `'${word}'`).join(',');

        const query = `
            SELECT word_pair, SUM(count) as total_count
            FROM (
                SELECT word1 || ' ' || word2 as word_pair, SUM(count) as count FROM trigram GROUP BY word1, word2
                UNION ALL
                SELECT word2 || ' ' || word3 as word_pair, SUM(count) as count FROM trigram GROUP BY word2, word3
            )
            WHERE LOWER(SUBSTR(word_pair, 1, INSTR(word_pair, ' ') - 1)) NOT IN (${commonWords})
            AND LOWER(SUBSTR(word_pair, INSTR(word_pair, ' ') + 1)) NOT IN (${commonWords})
            AND LENGTH(SUBSTR(word_pair, 1, INSTR(word_pair, ' ') - 1)) > 2
            AND LENGTH(SUBSTR(word_pair, INSTR(word_pair, ' ') + 1)) > 2
            GROUP BY word_pair
            ORDER BY total_count DESC
            LIMIT 500
        `;
        
        return this.db.prepare(query).all();
    }

}

module.exports = Database;