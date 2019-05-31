const sqlite = require('better-sqlite3')
const uuid = require('uuid/v1')
const natural = require('natural')
const _ = require('lodash')

const startWord = String.fromCharCode(0x0002)
const endWord = String.fromCharCode(0x0003)

class Database {
    constructor(guildid){
        this.db = new sqlite(`./data/${guildid}.sqlite`)

        const ngram = this.db.prepare("CREATE TABLE IF NOT EXISTS ngrams (id TEXT PRIMARY KEY NOT NULL, Word1 TEXT, Word2 TEXT, Word3 TEXT, Word4 TEXT)")
        const forward = this.db.prepare("CREATE TABLE IF NOT EXISTS forwards (id TEXT PRIMARY KEY NOT NULL, Ngram TEXT, Word TEXT, Count Int)")
        const backward = this.db.prepare("CREATE TABLE IF NOT EXISTS backwards (id TEXT PRIMARY KEY NOT NULL, Ngram TEXT, Word TEXT, Count Int)")
        const wordcount = this.db.prepare("CREATE TABLE IF NOT EXISTS wordcount (id int PRIMARY KEY NOT NULL, Count Int)")
        const sentcount = this.db.prepare("CREATE TABLE IF NOT EXISTS sentcount (id int PRIMARY KEY NOT NULL, Count Int)")
        ngram.run()
        forward.run()
        backward.run()
        wordcount.run()
        sentcount.run()
        const ngramIndex = this.db.prepare("CREATE INDEX IF NOT EXISTS ngram-words ON ngrams (word1, word2, word3, word4)")
        const foreIndex = this.db.prepare("CREATE INDEX IF NOT EXISTS forwards-ngram ON forwards (ngram)")
        const backIndex = this.db.prepare("CREATE INDEX IF NOT EXISTS backwards-ngram ON backwards (ngram)")
        ngramIndex.run()
        foreIndex.run()
        backIndex.run()

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

        this.insert4gram = this.db.prepare('INSERT INTO ngrams VALUES (:id, :word1, :word2, :word3, :word4)')
        this.insert3gram = this.db.prepare('INSERT INTO ngrams VALUES (:id, :word1, :word2, :word3, NULL)')
        this.insertForward = this.db.prepare('INSERT INTO forwards VALUES (:id, :ngram, :word, 1)')
        this.insertBackward = this.db.prepare('INSERT INTO backwards VALUES (:id, :ngram, :word, 1)')

        this.selectngram = this.db.prepare('SELECT * FROM ngrams WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 AND word4 = :word4')
        this.getngram = this.db.prepare('SELECT * FROM ngrams WHERE id = :id')
        this.select3gram = this.db.prepare('SELECT * FROM ngrams WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 AND word4 IS NULL')
        this.selectnforward = this.db.prepare('SELECT * FROM forwards where ngram = :ngram and word = :word')
        this.selectnbackward = this.db.prepare('SELECT * FROM backwards where ngram = :ngram and word = :word')

        this.addForward = this.db.prepare('UPDATE forwards SET count = count + 1 WHERE id = :id')
        this.addBackward = this.db.prepare('UPDATE backwards SET count = count + 1 WHERE id = :id')
        this.addWCount = this.db.prepare('UPDATE wordcount SET count = count + 1 WHERE id = :id')
        this.addSCount = this.db.prepare('UPDATE sentcount SET count = count + 1 WHERE id = :id')

        this.randomStart = this.db.prepare('SELECT * FROM ngrams ORDER BY RANDOM() LIMIT 1')
        this.randomBack = this.db.prepare('SELECT * FROM backwards WHERE ngram = :ngram ORDER BY RANDOM() LIMIT 1')
        this.randomFore = this.db.prepare('SELECT * FROM forwards WHERE ngram = :ngram ORDER BY RANDOM() LIMIT 1')
    }

    makeSentence(){
        var starting = this.randomStart.get()
        var buildResult = []
        if (starting.Word1 !== startWord) buildResult.push(starting.Word1)
        buildResult.push(starting.Word2)
        if (starting.Word3 !== endWord) { buildResult.push(starting.Word3) } else return buildResult.join(' ')
        if (starting.Word4 !== endWord) { buildResult.push(starting.Word4) } else return buildResult.join(' ')
        var chain = starting.id
        this.backThatAssUp(starting, buildResult)
        while (1==1) {
            var next = this.randomFore.get({ngram: chain})
            if (next === undefined) return buildResult.join(' ')
            if (next.Word !== endWord) { buildResult.push(next.Word) } else return buildResult.join(' ')
            var lastFour = buildResult.slice(-4)
            var newGram = this.selectngram.get({word1: lastFour[0], word2: lastFour[1], word3: lastFour[2], word4: lastFour[3]})
            if (newGram === undefined) return buildResult.join(' ')
            chain = newGram.id
        }
    }

    backThatAssUp(startingNGram, currentSentence){
        var next = this.randomBack.get({ngram: startingNGram.id})
        if (next === undefined) return 
        if (next.Word !== startWord) { currentSentence.splice(0,0,next.Word) } else return 
        var firstFour = currentSentence.slice(4)
        var newGram = this.selectngram.get({word1: firstFour[0], word2: firstFour[1], word3: firstFour[2], word4: firstFour[3]})
        if (newGram === undefined) return 
        this.backThatAssUp(newGram, currentSentence)        
    }

    markovInput(allText){
        var sentenceTokenizer = new natural.SentenceTokenizer() 
        var sentences = sentenceTokenizer.tokenize(allText)
        this.updateSCount(sentences.length)
        var tokenizer = new natural.WordPunctTokenizer()
        _.forEach(sentences, sentence => {
            this.markovInsert(tokenizer.tokenize(sentence))
        })
    }

    markovInsert(words) {
        var FullWordList = [startWord, ...words, endWord]
        this.updateWCount(words.length)
        this.markovRecord(undefined, FullWordList)
    }

    updateWCount(len) {
        if (len > 6) this.addWCount.run({id: 6})
        else this.addWCount.run({id: len})
    }

    updateSCount(len) {
        if (len > 8) this.addSCount.run({id: 8})
        else this.addSCount.run({id: len})
    }

    markovRecord(previous, rest) {
        if (rest.length == 3) {
            var exists = this.select3gram.get({word1: rest[0], word2: rest[1], word3: rest[2]})
            if (exists === undefined) this.insert3gram.run({id: uuid(), word1: rest[0], word2: rest[1], word3: rest[2]})
            return
        } 
        var currentngram
        var existing = this.selectngram.get({word1: rest[0], word2: rest[1], word3: rest[2], word4: rest[3]})
        if (existing === undefined) {
            currentngram = uuid()
            this.insert4gram.run({id: currentngram, word1: rest[0], word2: rest[1], word3: rest[2], word4: rest[3]})
        } else {
            currentngram = existing.id
        }
        if (previous !== undefined) {
            var backExists = this.selectnbackward.get({ngram: currentngram, word: previous})
            if (backExists === undefined) this.insertBackward.run({id: uuid(), ngram: currentngram, word: previous})
            else this.addBackward.run({id:backExists.id})
        } 
        if (rest.length == 4) return
        var forwardExists = this.selectnforward.get({ngram: currentngram, word: rest[4]})
        if (forwardExists === undefined) this.insertForward.run({id: uuid(), ngram: currentngram, word: rest[4]})
        else this.addForward.run({id:forwardExists.id})
        this.markovRecord(rest[0], rest.slice(1))
    }
}

module.exports = Database;