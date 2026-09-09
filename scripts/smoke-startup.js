#!/usr/bin/env node
/**
 * Smoke-test command loading without a Discord login.
 * Loads prefix + slash modules the same way BenderBot.js does (via klaw),
 * then exercises /markov against empty and trained SQLite DBs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import klaw from 'klaw'
import Database from '../db/db.js'
import Markov from '../slashcommands/fun/markov.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const EMPTY_MSG = "I haven't learned enough words yet."

function collectJsFiles(dir) {
  return new Promise((resolve, reject) => {
    const files = []
    klaw(dir)
      .on('data', (item) => {
        const cmdFile = path.parse(item.path)
        if (!cmdFile.ext || cmdFile.ext !== '.js') return
        files.push(cmdFile)
      })
      .on('end', () => resolve(files))
      .on('error', reject)
  })
}

async function loadJsModules(relDir) {
  const loaded = []
  const errors = []
  const mockClient = { logger: { log() {} } }
  for (const cmdFile of await collectJsFiles(path.join(ROOT, relDir))) {
    const filePath = path.join(cmdFile.dir, `${cmdFile.name}${cmdFile.ext}`)
    try {
      const mod = await import(pathToFileURL(filePath).href)
      const Cmd = mod.default
      const props = new Cmd(mockClient)
      loaded.push({
        name: props.help?.name,
        file: path.relative(ROOT, filePath),
        data: props.data ? props.data.toJSON() : null,
      })
    } catch (e) {
      errors.push(`${path.relative(ROOT, filePath)}: ${e && e.stack ? e.stack : e}`)
    }
  }
  return { loaded, errors }
}

function mockInteraction({ guild, word }) {
  const replies = []
  return {
    guild,
    options: {
      getString(name) {
        return name === 'word' ? word : null
      },
    },
    replies,
    async reply(payload) {
      if (!payload || typeof payload.content !== 'string' || !payload.content.trim()) {
        throw new Error('Discord rejects empty interaction content')
      }
      replies.push(payload)
      return payload
    },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const failures = []
  const pass = (label) => console.log(`PASS  ${label}`)
  const fail = (label, err) => {
    failures.push(`${label}: ${err && err.message ? err.message : err}`)
    console.error(`FAIL  ${label}: ${err && err.stack ? err.stack : err}`)
  }

  try {
    assert(!fs.existsSync(path.join(ROOT, 'commands/fun/Markov.js')), 'commands/fun/Markov.js should be deleted')
    pass('prefix Markov.js deleted')
  } catch (e) {
    fail('prefix Markov.js deleted', e)
  }

  let slash
  try {
    slash = await loadJsModules('slashcommands')
    if (slash.errors.length) throw new Error(slash.errors.join('\n'))
    const names = slash.loaded.map((c) => c.name).sort()
    console.log(`Loaded ${slash.loaded.length} slash commands: ${names.join(', ')}`)
    const help = slash.loaded.find((c) => c.name === 'help')
    assert(help, '/help module did not load')
    assert(help.data?.name === 'help', 'slash payload name is not help')
    const commandOpt = (help.data.options || []).find((o) => o.name === 'command')
    const categoryOpt = (help.data.options || []).find((o) => o.name === 'category')
    assert(commandOpt?.autocomplete, '/help command option should autocomplete')
    assert(categoryOpt, '/help should offer a category option')
    pass('slash command load + /help schema')

    const markov = slash.loaded.find((c) => c.name === 'markov')
    assert(markov, '/markov module did not load')
    assert(markov.data?.name === 'markov', 'slash payload name is not markov')
    const configCmd = slash.loaded.find((c) => c.name === 'config')
    assert(configCmd, '/config module did not load')
    const overview = (configCmd.data.options || []).find((o) => o.name === 'overview')
    assert(overview, '/config overview subcommand is missing')
    assert((overview.options || []).some((o) => o.name === 'format'), 'overview format option is missing')
    assert((overview.options || []).some((o) => o.name === 'log'), 'overview log option is missing')
    const wordOpt = (markov.data.options || []).find((o) => o.name === 'word')
    assert(wordOpt, 'missing required word option')
    assert(wordOpt.required, 'word option must be required')
    assert(!(markov.data.options || []).some((o) => o.name === 'train' || (o.options || []).some((s) => s.name === 'train')), 'train subcommand must not exist')
    pass('slash command load + /markov schema')
  } catch (e) {
    fail('slash command load + /markov schema', e)
  }

  try {
    const prefix = await loadJsModules('commands')
    if (prefix.errors.length) throw new Error(prefix.errors.join('\n'))
    const names = prefix.loaded.map((c) => c.name)
    console.log(`Loaded ${prefix.loaded.length} prefix commands: ${names.sort().join(', ')}`)
    assert(!names.includes('markov'), 'prefix markov command should be gone')
    assert(!names.includes('chain'), 'prefix chain alias command should be gone')
    pass('prefix commands no longer include markov/chain')
  } catch (e) {
    fail('prefix commands no longer include markov/chain', e)
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  const dbs = {}
  const client = {
    getDatabase(id) {
      const key = String(id)
      if (!dbs[key]) dbs[key] = new Database(id)
      return dbs[key]
    },
    getSettings() {
      return { markovLevel: '4' }
    },
    logger: {
      log(content, type) {
        if (type === 'error') console.error('logger', content)
      },
    },
  }
  const cmd = new Markov(client)

  try {
    const interaction = mockInteraction({ guild: null, word: 'hello' })
    await cmd.execute(interaction)
    assert(interaction.replies.length === 1, 'DM empty-chain should reply once')
    assert(interaction.replies[0].content === EMPTY_MSG, `DM empty-chain expected fallback, got ${JSON.stringify(interaction.replies[0].content)}`)
    pass('DM /markov with empty chain replies instead of failing')
  } catch (e) {
    fail('DM /markov with empty chain replies instead of failing', e)
  }

  try {
    const guild = { id: 'smoke-empty-guild' }
    const interaction = mockInteraction({ guild, word: 'hello' })
    await cmd.execute(interaction)
    assert(interaction.replies.length === 1, 'empty guild should reply once')
    assert(interaction.replies[0].content === EMPTY_MSG, `empty guild expected fallback, got ${JSON.stringify(interaction.replies[0].content)}`)
    pass('guild /markov with empty chain replies instead of failing')
  } catch (e) {
    fail('guild /markov with empty chain replies instead of failing', e)
  }

  try {
    const guild = { id: 'smoke-trained-guild' }
    const db = client.getDatabase(guild.id)
    db.markovInput('hello world this is a test of the markov chain generator')
    db.markovInput('hello there friend how are you doing today')
    db.markovInput('hello again from the trained smoke test corpus')
    const interaction = mockInteraction({ guild, word: 'Hello' })
    await cmd.execute(interaction)
    assert(interaction.replies.length === 1, 'trained guild should reply once')
    const content = interaction.replies[0].content
    assert(content !== EMPTY_MSG, `trained chain should generate a sentence, got fallback: ${JSON.stringify(content)}`)
    assert(content.toLowerCase().includes('hello'), `generated sentence should start from seed hello, got ${JSON.stringify(content)}`)
    console.log(`Generated: ${content}`)
    pass('guild /markov with trained chain generates a sentence')
  } catch (e) {
    fail('guild /markov with trained chain generates a sentence', e)
  }

  if (failures.length) {
    console.error(`\n${failures.length} smoke check(s) failed`)
    process.exit(1)
  }
  console.log('\nAll smoke checks passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
