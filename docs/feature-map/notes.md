# Feature Map notes

Hand-written companion to the generated `INDEX.md`. One section per slash command.

- **Seed**: what state or config the command needs before it can run.
- **Reach**: how to verify it locally with `npm run control -- execute <fixture.js>` or unit tests. Anything `execute` cannot prove (real Discord rendering, Discord `defaultMemberPermissions` visibility, button/select clicks, live external APIs) belongs under "For you to test" in the PR.

`npm run control -- map --check` (and `npm test` via `test/featureMap.test.js`) fail when a command has no section here, a section is missing `Seed` or `Reach`, or a backticked `/command subcommand` reference names a subcommand that does not exist. Keep sections short and update them in the same PR that changes a command.

## /astro

NASA Astronomy Picture of the Day lookup with optional `date`.

- Seed: `config.NASA_API_KEY` and a `fetch` stub if verifying offline.
- Reach: live NASA APOD calls are network; stub `globalThis.fetch` in a fixture or test to verify embed formatting without hitting NASA.

## /backfill

Control Discord history crawl, transcript compilation, and File Search upload for a server (`status`, `start`, `pause`, `resume`, `prioritize`).

- Seed: per-guild SQLite DB (`client.getDatabase(guildId)`) plus `client.chatBackfill` stub for `start` / `pause` / `resume`.
- Reach: `ctx.run("backfill", { subcommand: "status" })` works against an isolated temp SQLite DB; live Discord channel history crawling and Gemini File Search uploads require a real bot session.

## /bgg

BoardGameGeek lookup with autocomplete and detail/visibility choices.

- Seed: `config.BGGToken` for live lookups; none when stubbing `BoardGameGeek.Search` / XML fetches.
- Reach: `test/bggCommand.test.js`, `test/bggXmlParser.test.js`, and `test/boardgamegeek.test.js` cover parsing, search, and ephemeral flags. Real BGG API calls are network.

## /boobs

NSFW random image lookup via `oboobs.ru`.

- Seed: none; NSFW channel required in Discord.
- Reach: network call to `api.oboobs.ru`; stub `globalThis.fetch` if verifying embed formatting offline.

## /book

Open Library book search embed.

- Seed: none.
- Reach: calls Open Library over the network via `modules/openLibrary.js`; stub `globalThis.fetch` to verify embed formatting offline.

## /butts

NSFW random image lookup via `obutts.ru`.

- Seed: none; NSFW channel required in Discord.
- Reach: network call to `api.obutts.ru`; stub `globalThis.fetch` if verifying embed formatting offline.

## /chuck

Random Chuck Norris fact, optionally targeting a mentioned user.

- Seed: none.
- Reach: network call to `api.chucknorris.io`; stub `globalThis.fetch` if verifying reply formatting offline.

## /config

Administrator server settings (`list`, `botprefix`, `randomresponsepercent`, `markovlevel`, `enablecommand`, `disablecommand`, `skipchannel`, `unskipchannel`, `overview`).

- Seed: `client.settings`, `client.exclusions`, `client.skipChannels`, and `client.config.botOwnerId` (for `/config overview`).
- Reach: `test/guildConfigOverview.test.js` covers `/config overview` redaction and formatting. `ctx.run("config", { subcommand: "list", isAdmin: true })` exercises option listing offline; Discord Administrator visibility requires a real guild (or `QA_UNLOCK_ADMIN_COMMANDS=1` on a local test bot).

## /context

Per-server context-pack management (`add`, `attach`, `set`, `list`, `preview`, `refresh`, `remove`, `clear`, `detach`, `status`).

- Seed: guild settings store (`client.settings`) and `client.geminiAI.contextPacks` (or stubbed pack service). Never commit or print real published Google Sheet CSV URLs.
- Reach: `test/contextCommand.test.js`, `test/contextPacks.test.js`, and `test/contextPackFreshness.test.js` cover SSRF guards, URL secrecy, caching, and dashboard formatting. Interactive refresh button clicks and live Google Sheet fetches are for real Discord testing.

## /cy

InspiroBot image/quote embed.

- Seed: none.
- Reach: network call to `inspirobot.me`; stub `globalThis.fetch` to verify offline.

## /dadjoke

Random dad joke embed from `icanhazdadjoke.com`.

- Seed: `interaction.guild.members.cache` entry for `client.user.id` (used for displayName) and `fetch` stub for offline runs.
- Reach: network call to `icanhazdadjoke.com`; verify live embed rendering in Discord.

## /dicks

NSFW random Reddit image lookup via `modules/redditImageFetcher.js`.

- Seed: none; NSFW channel required in Discord.
- Reach: network call to Reddit; verify live results in an NSFW test channel.

## /drink

Cocktail recipe search via TheCocktailDB, with select-menu disambiguation when multiple drinks match.

- Seed: none.
- Reach: `test/drinkCommand.test.js` covers single-match replies, select-menu selection, timeout cleanup, and deleted-message handling. Live TheCocktailDB search and real select-menu clicks are for Discord testing.

## /flip

Table-flip (or custom text flip) reply + follow-up.

- Seed: none.
- Reach: `ctx.run("flip", { strings: { toflip: "hello" } })` runs completely offline with no network or DB.

## /gossip

Post a gossip alert embed with `minor` (no ping) or `regular` (`@here` ping).

- Seed: `client.emojis.cache` (optional; missing emoji renders `undefined` if not stubbed).
- Reach: `ctx.run("gossip", { subcommand: "minor", strings: { message: "test" }, clientExtras: { emojis: { cache: new Map() } } })`.

## /help

Interactive slash-command directory with autocomplete, category filter, and per-server feature availability.

- Seed: loaded `client.slashcommands` collection (provided automatically by `control-bender execute`).
- Reach: `scripts/control-fixtures/help.js` (`npm run control -- execute scripts/control-fixtures/help.js --contains "/wiki"`); also covered by `test/helpCatalog.test.js`, `test/helpCommand.test.js`, and `test/guildHelpFeatures.test.js`. Select-menu switching requires Discord.

## /inspire

AI-generated inspirational image from InspiroBot with graceful unavailable fallback.

- Seed: none.
- Reach: `test/inspireSloganCommands.test.js` covers success, HTTP errors, non-URL bodies, and thrown fetch errors.

## /lotr

Random Lord of the Rings quote via The One API.

- Seed: `config.LOTR_API_KEY`.
- Reach: makes multiple sequential `fetch` calls to `the-one-api.dev`; stub `globalThis.fetch` for offline runs.

## /markov

Generate a Markov chain sentence seeded with `word` from the guild's SQLite DB.

- Seed: per-guild SQLite DB trained via `db.markovInput(...)` (or empty DB for fallback text).
- Reach: `scripts/control-fixtures/markov.js` (`npm run control -- execute scripts/control-fixtures/markov.js --contains "hello"`) and `npm run smoke`.

## /mcu

Next upcoming MCU film countdown embed.

- Seed: none.
- Reach: network call to `whenisthenextmcufilm.com`; stub `globalThis.fetch` to verify offline.

## /people

Bot-owner mapping of Discord user IDs to real names for chat understanding (`set`, `clear`, `whois`, `list`).

- Seed: `config.botOwnerId` matching the invoking user and per-guild SQLite DB (`people` table).
- Reach: `ctx.run("people", { subcommand: "list", isOwner: true })` runs against a temp SQLite DB; non-owner rejection runs with `isOwner: false`.

## /ping

Latency check replying `Pong!` and editing with round-trip latency.

- Seed: none.
- Reach: `scripts/control-fixtures/ping.js` (`npm run control -- execute scripts/control-fixtures/ping.js --contains "Latency"`) and `test/pingCommand.test.js`.

## /prompt

Send a direct prompt to Gemini AI and split long replies across Discord messages.

- Seed: `interaction.client.geminiAI.runPrompt` (stubbed offline or configured with Gemini API key live).
- Reach: pass a stub `geminiAI` via `clientExtras` / `interactionExtras` to verify message splitting; live Gemini output is network.

## /random

Random animal photo/fact subcommands (`bird`, `cat`, `dog`, `fox`, `kangaroo`, `koala`, `panda`, `raccoon`, `otter`).

- Seed: none.
- Reach: fetches external animal APIs; stub `globalThis.fetch` to verify embed formatting offline.

## /riddle

Puzzle-hunt guess checker, or random riddle from `riddles-api.vercel.app` when `guess` is omitted.

- Seed: none.
- Reach: `ctx.run("riddle", { strings: { guess: "start" } })` runs offline; omitting `guess` hits `riddles-api.vercel.app`.

## /roll

Dice roller (`roll` package) with optional Google CSE number thumbnail when `google_key` and `google_cxid` are configured.

- Seed: none (default `google_key: ""` skips CSE cleanly).
- Reach: `scripts/control-fixtures/roll.js` (`npm run control -- execute scripts/control-fixtures/roll.js --contains "Total rolled"`) and `test/rollCommand.test.js`.

## /rule34

NSFW tag search against `rule34.xxx`.

- Seed: none; NSFW channel required in Discord.
- Reach: network call to `rule34.xxx`; verify live results in an NSFW test channel.

## /say

Transform and echo text (`something`, `tiny`, `big`, `bubbles`, `mirror`, `flipped`, `leet`, `creepy`, `bent`).

- Seed: none.
- Reach: `ctx.run("say", { subcommand: "big", strings: { message: "hi 42" } })` runs completely offline.

## /setpersonality

Manage per-guild Gemini AI personality (`set`, `view`, `reset`).

- Seed: `client.settings` store (provided automatically by `control-bender execute`).
- Reach: `ctx.run("setpersonality", { subcommand: "view" })` runs offline; personality prompt integration is tested in `test/personalityRoleFrame.test.js` and `test/guildConfigOverview.test.js`.

## /settings

Hidden bot-owner command to inspect or mutate `client.config` keys at runtime.

- Seed: `config.botOwnerId` matching `interaction.member.id`.
- Reach: `ctx.run("settings", { isOwner: true, strings: { setting: "activity" } })` runs offline; verify owner-only denial with `isOwner: false`.

## /slogan

Generate a slogan for `item` via `sloganizer.net` with unavailable fallback.

- Seed: none.
- Reach: `test/inspireSloganCommands.test.js` covers success, HTTP errors, empty responses, and fetch throws.

## /starboard

Admin command to view or update per-guild starboard settings (`channel`, `emoji`, `use_all`, `minimum`).

- Seed: `client.getGameData` / `setGameData` stub (or Enmap store).
- Reach: `ctx.run("starboard", { isAdmin: true, clientExtras: { getGameData: () => ({}), setGameData() {} } })` prints current settings offline; reaction handling lives in `events/StarBoardAdd.js` and `events/StarBoardRemove.js`.

## /status

Ephemeral admin green/yellow/red health dashboard for the server (or `all:True` for bot owner).

- Seed: `client.usagePulse`, `client.imageGenProbe`, `client.settings`, and `isAdmin: true` (or `isOwner: true` for `all:True`).
- Reach: `test/statusCommand.test.js`, `test/guildHealth.test.js`, and `test/qaUnlock.test.js` cover health aggregation, URL secrecy, and permission gating.

## /statusupdate

Hidden bot-owner command to set the bot's Discord presence (`type`, `activity`, optional `url` for `STREAMING`).

- Seed: `config.botOwnerId` matching `interaction.user.id` and `client.user.setPresence` stub.
- Reach: `test/statusupdateCommand.test.js` and `test/botActivity.test.js` cover validation, owner gating, and streaming URL rules; member-list appearance requires Discord.

## /test

Admin latency test command (same `withResponse` + `resource.message.edit` path as `/ping`).

- Seed: none.
- Reach: `ctx.run("test", { isAdmin: true })` and `test/pingCommand.test.js`.

## /urban

Urban Dictionary lookup with paginated Next/Prev buttons.

- Seed: none.
- Reach: network call via `modules/UrbanDictionary.js`; button pagination requires Discord.

## /usage

Ephemeral admin 7-day slash-command usage pulse (or `all:True` for bot owner).

- Seed: `client.usagePulse` stub and `isAdmin: true` (or `isOwner: true` for `all:True`).
- Reach: `test/usageCommand.test.js`, `test/usagePulse.test.js`, and `test/qaUnlock.test.js`.

## /wiki

Wikipedia article summary lookup with OpenSearch autocomplete.

- Seed: none.
- Reach: network calls to `en.wikipedia.org` and `wtf_wikipedia`; stub network calls if testing offline.

## /xkcd

Show the latest (or numbered `comic`) xkcd comic embed.

- Seed: none.
- Reach: network call to `xkcd.com`; stub `globalThis.fetch` to verify embed formatting offline.
