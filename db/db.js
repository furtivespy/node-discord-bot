const sqlite = require('better-sqlite3')
const uuid = require('uuid/v1')
const natural = require('natural')
const _ = require('lodash')
var weighted = require('weighted')

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
        this.forwardquingramwords = this.db.prepare('SELECT word5 as nextword, count FROM quingram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 AND word4 = :word4 ORDER BY RANDOM() LIMIT 1')
        this.forwardquadgramwords = this.db.prepare('SELECT word4 as nextword, count FROM quadgram WHERE word1 = :word1 AND word2 = :word2 AND word3 = :word3 ORDER BY RANDOM() LIMIT 1')
        this.forwardtrigramwords = this.db.prepare('SELECT word3 as nextword, count FROM trigram WHERE word1 = :word1 AND word2 = :word2 ORDER BY RANDOM() LIMIT 1')
        this.forwardbigramwords = this.db.prepare('SELECT word2 as nextword, count FROM bigram WHERE word1 = :word1 ORDER BY RANDOM() LIMIT 1')
        this.backwardquingramwords = this.db.prepare('SELECT * FROM quingram WHERE word2 = :word2 AND word3 = :word3 AND word4 = :word4 AND word5 = :word5 ORDER BY RANDOM() LIMIT 1')
        this.backwardquadgramwords = this.db.prepare('SELECT * FROM quadgram WHERE word2 = :word2 AND word3 = :word3 AND word4 = :word4 ORDER BY RANDOM() LIMIT 1')
        this.backwardtrigramwords = this.db.prepare('SELECT * FROM trigram WHERE word2 = :word2 AND word3 = :word3 ORDER BY RANDOM() LIMIT 1')
        this.backwardbigramwords = this.db.prepare('SELECT * FROM bigram WHERE word2 = :word2 ORDER BY RANDOM() LIMIT 1')
        this.randomquingram = this.db.prepare('SELECT * FROM quingram ORDER BY RANDOM() LIMIT 1')
        this.randomquadgram = this.db.prepare('SELECT * FROM quadgram ORDER BY RANDOM() LIMIT 1')
        this.randomtrigram = this.db.prepare('SELECT * FROM trigram ORDER BY RANDOM() LIMIT 1')
        this.randombigram = this.db.prepare('SELECT * FROM bigram ORDER BY RANDOM() LIMIT 1')
    }

    makeSentence(ngramLength){
        switch(ngramLength){
            case "2": //not doing bigrams
            case "3":
                this.RandoSelect = this.randomtrigram
                this.goForth = this.forwardtrigramwords
                this.goBack = this.backwardtrigramwords
                break
            case "5":
                this.RandoSelect = this.randomquingram
                this.goForth = this.forwardquingramwords
                this.goBack = this.backwardquingramwords
                break
            case "4":
            default:
                this.RandoSelect = this.randomquadgram
                this.goForth = this.forwardquadgramwords
                this.goBack = this.backwardquadgramwords
                break;
        }
        return this.SayThings()
    }

    SayThings(){
        var sentences = this.selectSCount.all()
        var words = this.selectWCount.all()
        var sayThisManyS = weighted.select(sentences.map(s => s.id), sentences.map(s => s.Count))
        var sayThisManyW = weighted.select(words.map(s => s.id), words.map(s => s.Count))
        var wholeResponse = ""
        for(var i=0;i<sayThisManyS;i++){
            if (i > 0) wholeResponse += '\n'
            wholeResponse += this.BuildSentence()
        }
        if (wholeResponse.split(' ').length < sayThisManyW){
            wholeResponse += '\n'
            wholeResponse += this.BuildSentence()
        } 
        return wholeResponse
    }

    BuildSentence(){
        var randomStart = this.RandoSelect.get()
        var newSentence = [randomStart.word1, randomStart.word2, randomStart.word3]
        if (randomStart.word4) newSentence.push(randomStart.word4)
        if (randomStart.word5) newSentence.push(randomStart.word5)
        this.backThatAssUp(newSentence)
        this.goForthAndMultipy(newSentence)
        return this.filter(newSentence)
    }

    backThatAssUp(sentence){
        if (sentence[0] === startWord) return
        var next = this.goBack.get({word2: sentence[0], word3: sentence[1], word4: sentence[2], word5: sentence[3]})
        if (next === undefined) return 
        sentence.splice(0,0,next.word1)
        this.backThatAssUp(sentence)   
    }
    goForthAndMultipy(sentence){
        if (sentence[sentence.length-1] === endWord) return
        var lastFour = sentence.slice(-4)
        var next = this.forwardquingramwords.get({word1: lastFour[0], word2: lastFour[1], word3: lastFour[2], word4: lastFour[3]})
        if (next === undefined) return 
        sentence.push(next.nextword)
        this.goForthAndMultipy(sentence)    
    }

    filter(currentSentence) {
        while(currentSentence[0] === startWord) { currentSentence.shift() }
        while(currentSentence[currentSentence.length-1] === endWord) { currentSentence.pop() }
        var sentence = currentSentence.join(' ')
        console.log(sentence)
        var cleaned = sentence.replace(/\s([!.?:;,”’])/g, '$1').replace(/\s(['"“])\s/g, '$1')
        console.log(cleaned)
        return cleaned
    }

    markovInput(allText){
        var sentences = _.without(allText.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s/g),'',' ')
        this.updateSCount(sentences.length)
        _.forEach(sentences, sentence => this.markovInsert(sentence))
    }

    markovInsert(words) {
        var splits = words.split(/((?:(?:https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(?:[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9-\u21AA\u231A-\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614-\u2615\u2618\u261D\u2620\u2622-\u2623\u2626\u262A\u262E-\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u2660\u2663\u2665-\u2666\u2668\u267B\u267F\u2692-\u2697\u2699\u269B-\u269C\u26A0-\u26A1\u26AA-\u26AB\u26B0-\u26B1\u26BD-\u26BE\u26C4-\u26C5\u26C8\u26CE-\u26CF\u26D1\u26D3-\u26D4\u26E9-\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733-\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763-\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|(?:\uD83C[\uDC04\uDCCF\uDD70-\uDD71\uDD7E-\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01-\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50-\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96-\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F-\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95-\uDD96\uDDA4-\uDDA5\uDDA8\uDDB1-\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDEE0-\uDEE5\uDEE9\uDEEB-\uDEEC\uDEF0\uDEF3-\uDEF6]|\uD83E[\uDD10-\uDD1E\uDD20-\uDD27\uDD30\uDD33-\uDD3A\uDD3C-\uDD3E\uDD40-\uDD45\uDD47-\uDD4B\uDD50-\uDD5E\uDD80-\uDD91\uDDC0]))|<.?:[A-zÀ-ÿ-]+:[0-9]+>|<[@#]!?\d+>|[A-zÀ-ÿ-]+|[0-9._]+|.|!|\?|'|"|:|;|,|-)/i)
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

}

module.exports = Database;