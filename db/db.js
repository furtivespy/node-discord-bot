const sqlite = require('better-sqlite3')
const uuid = require('uuid/v1')
const natural = require('natural')
const _ = require('lodash')

const startWord = String.fromCharCode(0x0002)
const endWord = String.fromCharCode(0x0003)

class Database {
    constructor(guildid){
        this.db = new sqlite(`./data/${guildid}.sqlite`)

        //DB INIT SECTION
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
        this.forwardquingramwords = this.db.prepare('SELECT * FROM quingram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 AND word4 = :word4 ORDER BY RANDOM() LIMIT 1')
        this.forwardquadgramwords = this.db.prepare('SELECT * FROM quadgram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 ORDER BY RANDOM() LIMIT 1')
        this.forwardtrigramwords = this.db.prepare('SELECT * FROM trigram WHERE word1 = :word1 AND word2 = :word2 ORDER BY RANDOM() LIMIT 1')
        this.forwardbigramwords = this.db.prepare('SELECT * FROM bigram WHERE word1 = :word1 ORDER BY RANDOM() LIMIT 1')
        this.backwardquingramwords = this.db.prepare('SELECT * FROM quingram WHERE word2 = :word2 AND word3 = :word3 AND word4 = :word4 AND word5 = :word5 ORDER BY RANDOM() LIMIT 1')
        this.backwardquadgramwords = this.db.prepare('SELECT * FROM quadgram WHERE word2 = :word2 AND word3 = :word3 AND word4 = :word4 ORDER BY RANDOM() LIMIT 1')
        this.backwardtrigramwords = this.db.prepare('SELECT * FROM trigram WHERE word2 = :word2 AND word3 = :word3 ORDER BY RANDOM() LIMIT 1')
        this.backwardbigramwords = this.db.prepare('SELECT * FROM bigram WHERE word2 = :word2 ORDER BY RANDOM() LIMIT 1')
        this.randomquingram = this.db.prepare('SELECT * FROM quingram ORDER BY RANDOM() LIMIT 1')
        this.randomquadgram = this.db.prepare('SELECT * FROM quadgram ORDER BY RANDOM() LIMIT 1')
        this.randomtrigram = this.db.prepare('SELECT * FROM trigram ORDER BY RANDOM() LIMIT 1')
        this.randombigram = this.db.prepare('SELECT * FROM bigram ORDER BY RANDOM() LIMIT 1')

        this.addWCount = this.db.prepare('UPDATE wordcount SET count = count + 1 WHERE id = :id')
        this.addSCount = this.db.prepare('UPDATE sentcount SET count = count + 1 WHERE id = :id')

    }

    makeSentence(ngramLength){
        switch(ngramLength){
            case 2:
                return this.makeSentence3()
            case 3:
                return this.makeSentence3()
            case 5:
                return this.makeSentence5()
            case 4:
            default:
                return this.makeSentence4()
        }
    }

    makeSentence5(){
        var starting = this.randomquingram.get()
        var buildResult = [starting.word1, starting.word2, starting.word3, starting.word4, starting.word5]
        this.backThatAssUp5(buildResult)
        this.goForthAndMultipy5(buildResult)
        return this.filter(buildResult)
    }

    backThatAssUp5(currentSentence){
        if (currentSentence[0] === startWord) return
        var next = this.backwardquingramwords.get({word2: currentSentence[0], word3: currentSentence[1], word4: currentSentence[2], word5: currentSentence[3]})
        if (next === undefined) return 
        currentSentence.splice(0,0,next.word1)
        this.backThatAssUp5(currentSentence)      
    }
    goForthAndMultipy5(currentSentence){
        if (currentSentence[currentSentence.length-1] === endWord) return
        var lastFour = currentSentence.slice(-4)
        var next = this.forwardquingramwords.get({word1: lastFour[0], word2: lastFour[1], word3: lastFour[2], word4: lastFour[3]})
        if (next === undefined) return 
        currentSentence.push(next.word5)
        this.goForthAndMultipy5(currentSentence)      
    }

    makeSentence4(){
        var starting = this.randomquadgram.get()
        var buildResult = [starting.word1, starting.word2, starting.word3, starting.word4]
        this.backThatAssUp4(buildResult)
        this.goForthAndMultipy4(buildResult)
        return this.filter(buildResult)
    }

    backThatAssUp4(currentSentence){
        if (currentSentence[0] === startWord) return
        var next = this.backwardquadgramwords.get({word2: currentSentence[0], word3: currentSentence[1], word4: currentSentence[2]})
        if (next === undefined) return 
        currentSentence.splice(0,0,next.word1)
        this.backThatAssUp4(currentSentence)      
    }
    goForthAndMultipy4(currentSentence){
        if (currentSentence[currentSentence.length-1] === endWord) return
        var lastThree = currentSentence.slice(-3)
        var next = this.forwardquadgramwords.get({word1: lastThree[0], word2: lastThree[1], word3: lastThree[2]})
        if (next === undefined) return 
        currentSentence.push(next.word4)
        this.goForthAndMultipy4(currentSentence)      
    }

    makeSentence3(){
        var starting = this.randomtrigram.get()
        var buildResult = [starting.word1, starting.word2, starting.word3]
        this.backThatAssUp3(buildResult)
        this.goForthAndMultipy3(buildResult)
        return this.filter(buildResult)
    }
    backThatAssUp3(currentSentence){
        if (currentSentence[0] === startWord) return
        var next = this.backwardtrigramwords.get({word2: currentSentence[0], word3: currentSentence[1]})
        if (next === undefined) return 
        currentSentence.splice(0,0,next.word1)
        this.backThatAssUp3(currentSentence)      
    }
    goForthAndMultipy3(currentSentence){
        if (currentSentence[currentSentence.length-1] === endWord) return
        var lastTwo = currentSentence.slice(-2)
        var next = this.forwardtrigramwords.get({word1: lastTwo[0], word2: lastTwo[1]})
        if (next === undefined) return 
        currentSentence.push(next.word3)
        this.goForthAndMultipy3(currentSentence)      
    }

    filter(currentSentence) {
        while(currentSentence[0] === startWord) { currentSentence.shift() }
        while(currentSentence[currentSentence.length-1] === endWord) { currentSentence.pop() }
        var sentence = currentSentence.join(' ')
        var cleaned = sentence.replace(/\s([!.?:;,])/g, '$1').replace(/\s(['])\s/g, '$1')
        return cleaned
    }

    markovInput(allText){
        var sentenceTokenizer = new natural.SentenceTokenizer() 
        var sentences = sentenceTokenizer.tokenize(allText)
        this.updateSCount(sentences.length)
        _.forEach(sentences, sentence => this.markovInsert(sentence))
    }

    markovInsert(words) {
        this.updateWCount(words.length)
        var tokenizer = new natural.WordPunctTokenizer()
        var NGrams = natural.NGrams
        NGrams.setTokenizer(tokenizer)
        _.forEach(NGrams.ngrams(words,5,startWord,endWord), gram => this.quingramAddOrInsert([...gram, endWord, endWord, endWord]))
        _.forEach(NGrams.ngrams(words,4,startWord,endWord), gram => this.quadgramAddOrInsert([...gram, endWord, endWord]))
        _.forEach(NGrams.ngrams(words,3,startWord,endWord), gram => this.trigramAddOrInsert([...gram, endWord]))
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

}

module.exports = Database;