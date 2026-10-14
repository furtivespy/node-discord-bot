import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGeminiAI, historyWindowFromFetch } from "../modules/geminiai.js";
import Chatbot from "../commands/other/ChatBot.js";

const BOT_ID = "bot-1";
const T0 = Date.UTC(2026, 9, 14, 18, 0, 0);

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function collectionFromNewest(messages) {
  const newestFirst = [...messages].sort(
    (a, b) => Number(b.createdTimestamp) - Number(a.createdTimestamp)
  );
  const map = new Map(newestFirst.map((msg) => [msg.id, msg]));
  return {
    values: () => map.values(),
    get: (id) => map.get(id),
    size: map.size,
  };
}

function lastUserText(contents) {
  for (let i = (contents || []).length - 1; i >= 0; i--) {
    if (contents[i]?.role === "user") return contents[i].parts?.[0]?.text || "";
  }
  return "";
}

function triggerLine(contents) {
  const text = lastUserText(contents);
  const withoutSpice = text.split("\n\nPlease try to include")[0];
  const lines = withoutSpice.split("\n").filter(Boolean);
  return lines[lines.length - 1] || withoutSpice;
}

function allText(contents) {
  return (contents || []).map((turn) => turn.parts?.[0]?.text || "").join("\n");
}

function makeGuild({ id, name, members = [] }) {
  const cache = new Map();
  for (const member of members) {
    cache.set(member.id, {
      id: member.id,
      displayName: member.displayName,
      user: {
        id: member.id,
        username: member.username || member.displayName,
        globalName: member.globalName || member.displayName,
      },
    });
  }
  cache.set(BOT_ID, {
    id: BOT_ID,
    displayName: "Bender",
    user: { id: BOT_ID, username: "Bender", globalName: "Bender" },
  });
  return { id, name, members: { cache } };
}

function makeAuthor(id, name) {
  return { id, username: name, globalName: name };
}

function makeMessage({
  id,
  content,
  author,
  channel,
  guild,
  settings,
  createdTimestamp,
  botId = BOT_ID,
}) {
  return {
    id: String(id),
    content,
    author,
    channel,
    guild,
    settings,
    createdTimestamp,
    createdAt: new Date(createdTimestamp),
    system: false,
    mentions: {
      users: {
        has: (userId) => userId === botId,
      },
    },
  };
}

function defaultSettings(overrides = {}) {
  return {
    prefix: "!",
    randRspPct: "0",
    markovLevel: "2",
    ai_selected_personality: "bender",
    context_packs: [],
    ...overrides,
  };
}

function makeClient({ peopleByGuild = {} } = {}) {
  const client = {
    config: { geminiKey: "test-key" },
    logger: {
      log(content, type) {
        if (type === "error") {
          throw content instanceof Error ? content : new Error(String(content));
        }
      },
      warn() {},
      error(content) {
        throw content instanceof Error ? content : new Error(String(content));
      },
    },
    user: { id: BOT_ID },
    getSkipChannels() {
      return [];
    },
    getDatabase(guildId) {
      const people = peopleByGuild[guildId] || [];
      return {
        hasFileSearchReady: () => false,
        getFileSearchStore: () => null,
        listPeople: () => people,
        getPeopleMap() {
          return new Map(people.map((person) => [person.user_id, person.real_name]));
        },
        markovInput() {},
        makeSentence: () => "",
      };
    },
  };
  client.geminiAI = createGeminiAI(client);
  return client;
}

function installDelayedGemini(ai, { hold, onCall } = {}) {
  const calls = [];
  ai.AI2 = {
    models: {
      async generateContent(req) {
        const recorded = {
          contents: structuredClone(req.contents),
          systemInstruction: req.config?.systemInstruction,
          guildHint: req.config?.systemInstruction,
        };
        if (typeof onCall === "function") onCall(recorded, req);
        if (hold) await hold.promise;
        calls.push(recorded);
        const question = triggerLine(req.contents);
        return {
          candidates: [
            {
              content: {
                parts: [{ text: `ANSWER ${question}` }],
              },
            },
          ],
        };
      },
    },
  };
  return calls;
}

function instanceRequestFields(ai) {
  return {
    keys: Object.keys(ai).sort(),
    currentMessage: ai.currentMessage,
    lastMessage: ai.lastMessage,
    currentSnapshot: ai.currentSnapshot,
    currentChannel: ai.currentChannel,
    activeReply: ai.activeReply,
    session: ai.session,
    chat: ai.chat,
  };
}

describe("historyWindowFromFetch", () => {
  it("keeps the trigger and earlier messages, drops later ones, and backfills a missing trigger", () => {
    const older = { id: "10", createdTimestamp: 10 };
    const trigger = { id: "20", createdTimestamp: 20 };
    const later = { id: "30", createdTimestamp: 30 };
    const window = historyWindowFromFetch(
      collectionFromNewest([later, trigger, older]),
      trigger
    );
    assert.deepEqual(
      window.map((msg) => msg.id),
      ["10", "20"]
    );

    const missing = historyWindowFromFetch(collectionFromNewest([later, older]), trigger);
    assert.deepEqual(
      missing.map((msg) => msg.id),
      ["10", "20"]
    );
  });
});

describe("concurrent chat reply isolation", () => {
  it("same-channel overlapping fetch does not treat a later message as this turn", async () => {
    const client = makeClient();
    const ai = client.geminiAI;
    const guild = makeGuild({
      id: "guild-1",
      name: "Alpha",
      members: [{ id: "u-a", displayName: "Alice" }],
    });
    const live = [];
    const firstFetch = deferred();
    const firstFetchStarted = deferred();
    let fetches = 0;
    const channel = {
      id: "chan-1",
      nsfw: false,
      messages: {
        async fetch() {
          fetches += 1;
          if (fetches === 1) {
            firstFetchStarted.resolve();
            await firstFetch.promise;
          }
          return collectionFromNewest(live);
        },
      },
    };
    const settings = defaultSettings();
    const msgA = makeMessage({
      id: "100",
      content: "<@bot-1> what is the weather in Chicago?",
      author: makeAuthor("u-a", "Alice"),
      channel,
      guild,
      settings,
      createdTimestamp: T0,
    });
    const msgB = makeMessage({
      id: "200",
      content: "<@bot-1> who won the Azul game last night?",
      author: makeAuthor("u-a", "Alice"),
      channel,
      guild,
      settings,
      createdTimestamp: T0 + 1000,
    });

    live.push(msgA);
    const pendingA = ai.buildContext(msgA, null);
    await firstFetchStarted.promise;
    live.push(msgB);
    firstFetch.resolve();
    const pendingB = ai.buildContext(msgB, null);
    const [ctxA, ctxB] = await Promise.all([pendingA, pendingB]);

    assert.match(lastUserText(ctxA.contents), /weather in Chicago/);
    assert.doesNotMatch(allText(ctxA.contents), /Azul/);
    assert.equal(ctxA.snapshot.triggerId, "100");
    assert.equal(ctxA.snapshot.authorId, "u-a");

    assert.match(allText(ctxB.contents), /weather in Chicago/);
    assert.match(lastUserText(ctxB.contents), /Azul/);
    assert.equal(ctxB.snapshot.triggerId, "200");
  });

  it("overlapping replies in different channels keep their own history, author, and personality", async () => {
    const peopleByGuild = {
      "guild-weather": [{ user_id: "u-alice", real_name: "Alice Weather" }],
      "guild-games": [{ user_id: "u-bob", real_name: "Bob Games" }],
    };
    const client = makeClient({ peopleByGuild });
    const ai = client.geminiAI;
    const attachHold = deferred();
    const bothAttaching = deferred();
    let attaching = 0;
    const origAttach = ai.contextPacks.attachIfNeeded.bind(ai.contextPacks);
    ai.contextPacks.attachIfNeeded = async (contents, snapshot) => {
      attaching += 1;
      if (attaching === 2) bothAttaching.resolve();
      await attachHold.promise;
      return origAttach(contents, snapshot);
    };
    const calls = installDelayedGemini(ai);

    const guildA = makeGuild({
      id: "guild-weather",
      name: "Weather Server",
      members: [{ id: "u-alice", displayName: "Alice" }],
    });
    const guildB = makeGuild({
      id: "guild-games",
      name: "Games Server",
      members: [{ id: "u-bob", displayName: "Bob" }],
    });
    const historyA = [];
    const historyB = [];
    const channelA = {
      id: "chan-weather",
      nsfw: false,
      messages: {
        async fetch() {
          return collectionFromNewest(historyA);
        },
      },
    };
    const channelB = {
      id: "chan-games",
      nsfw: false,
      messages: {
        async fetch() {
          return collectionFromNewest(historyB);
        },
      },
    };

    const msgA = makeMessage({
      id: "11",
      content: "<@bot-1> forecast for Chicago?",
      author: makeAuthor("u-alice", "Alice"),
      channel: channelA,
      guild: guildA,
      settings: defaultSettings({ ai_selected_personality: "detective" }),
      createdTimestamp: T0,
    });
    const msgB = makeMessage({
      id: "22",
      content: "<@bot-1> who won Azul?",
      author: makeAuthor("u-bob", "Bob"),
      channel: channelB,
      guild: guildB,
      settings: defaultSettings({ ai_selected_personality: "shakespeare" }),
      createdTimestamp: T0 + 50,
    });
    historyA.push(msgA);
    historyB.push(msgB);

    const before = instanceRequestFields(ai);
    const [ctxA, ctxB] = await Promise.all([
      ai.buildContext(msgA, null),
      ai.buildContext(msgB, null),
    ]);

    const genA = ai.generateContent(ctxA.contents, ctxA.snapshot);
    const genB = ai.generateContent(ctxB.contents, ctxB.snapshot);
    // Pause both replies inside attachGuildContextPacks (after the first await,
    // before getSystemInstructions) so a live settings mutation would leak
    // if generation still read the Discord message.
    await bothAttaching.promise;
    msgA.settings.ai_selected_personality = "pirate_qm";
    msgB.settings.ai_selected_personality = "detective";
    attachHold.resolve();
    await Promise.all([genA, genB]);

    assert.equal(calls.length, 2);
    const weatherCall = calls.find((call) => /forecast for Chicago/.test(allText(call.contents)));
    const gamesCall = calls.find((call) => /who won Azul/.test(allText(call.contents)));
    assert.ok(weatherCall, "expected a Gemini call for the weather channel");
    assert.ok(gamesCall, "expected a Gemini call for the games channel");

    assert.doesNotMatch(allText(weatherCall.contents), /Azul/);
    assert.doesNotMatch(allText(weatherCall.contents), /Bob Games/);
    assert.match(allText(weatherCall.contents), /Alice Weather/);
    assert.match(weatherCall.systemInstruction, /hardboiled detective/);
    assert.doesNotMatch(weatherCall.systemInstruction, /Shakespearean/);
    assert.doesNotMatch(weatherCall.systemInstruction, /Quartermaster/);

    assert.doesNotMatch(allText(gamesCall.contents), /Chicago/);
    assert.doesNotMatch(allText(gamesCall.contents), /Alice Weather/);
    assert.match(allText(gamesCall.contents), /Bob Games/);
    assert.match(gamesCall.systemInstruction, /Shakespearean/);
    assert.doesNotMatch(gamesCall.systemInstruction, /hardboiled detective/);

    const after = instanceRequestFields(ai);
    assert.deepEqual(after, before);
  });

  it("overlapping ChatBot replies in different channels send only their own context", async () => {
    const client = makeClient({
      peopleByGuild: {
        g1: [{ user_id: "u1", real_name: "Pat One" }],
        g2: [{ user_id: "u2", real_name: "Quinn Two" }],
      },
    });
    const hold = deferred();
    const bothHeld = deferred();
    let held = 0;
    installDelayedGemini(client.geminiAI, {
      hold,
      onCall() {
        held += 1;
        if (held === 2) bothHeld.resolve();
      },
    });
    const bot = new Chatbot(client);
    const sent = [];

    function channel(id, live) {
      return {
        id,
        nsfw: false,
        messages: {
          async fetch() {
            return collectionFromNewest(live);
          },
        },
        async send(payload) {
          sent.push({ channelId: id, content: payload.content });
        },
      };
    }

    const guild1 = makeGuild({
      id: "g1",
      name: "One",
      members: [{ id: "u1", displayName: "Pat" }],
    });
    const guild2 = makeGuild({
      id: "g2",
      name: "Two",
      members: [{ id: "u2", displayName: "Quinn" }],
    });
    const live1 = [];
    const live2 = [];
    const ch1 = channel("c1", live1);
    const ch2 = channel("c2", live2);
    const msg1 = makeMessage({
      id: "501",
      content: "<@bot-1> capital of France?",
      author: makeAuthor("u1", "Pat"),
      channel: ch1,
      guild: guild1,
      settings: defaultSettings(),
      createdTimestamp: T0,
    });
    const msg2 = makeMessage({
      id: "502",
      content: "<@bot-1> capital of Japan?",
      author: makeAuthor("u2", "Quinn"),
      channel: ch2,
      guild: guild2,
      settings: defaultSettings(),
      createdTimestamp: T0 + 10,
    });
    live1.push(msg1);
    live2.push(msg2);

    const before = instanceRequestFields(client.geminiAI);
    const running = Promise.all([bot.run(msg1, [], 0), bot.run(msg2, [], 0)]);
    await bothHeld.promise;
    hold.resolve();
    await running;

    const from1 = sent.filter((item) => item.channelId === "c1");
    const from2 = sent.filter((item) => item.channelId === "c2");
    assert.equal(from1.length, 1);
    assert.equal(from2.length, 1);
    assert.match(from1[0].content, /capital of France/);
    assert.doesNotMatch(from1[0].content, /Japan/);
    assert.match(from2[0].content, /capital of Japan/);
    assert.doesNotMatch(from2[0].content, /France/);
    assert.deepEqual(instanceRequestFields(client.geminiAI), before);
  });

  it("overlapping ChatBot replies in the same channel each answer their own trigger", async () => {
    const client = makeClient();
    const hold = deferred();
    const bothHeld = deferred();
    let held = 0;
    installDelayedGemini(client.geminiAI, {
      hold,
      onCall() {
        held += 1;
        if (held === 2) bothHeld.resolve();
      },
    });
    const bot = new Chatbot(client);
    const sent = [];
    const live = [];
    const firstFetch = deferred();
    const firstFetchStarted = deferred();
    let fetches = 0;
    const guild = makeGuild({
      id: "g-same",
      name: "Same",
      members: [{ id: "u-will", displayName: "Will" }],
    });
    const channel = {
      id: "c-same",
      nsfw: false,
      messages: {
        async fetch() {
          fetches += 1;
          if (fetches === 1) {
            firstFetchStarted.resolve();
            await firstFetch.promise;
          }
          return collectionFromNewest(live);
        },
      },
      async send(payload) {
        sent.push(payload.content);
      },
    };
    const settings = defaultSettings();
    const msgA = makeMessage({
      id: "601",
      content: "<@bot-1> question about otters",
      author: makeAuthor("u-will", "Will"),
      channel,
      guild,
      settings,
      createdTimestamp: T0,
    });
    const msgB = makeMessage({
      id: "602",
      content: "<@bot-1> question about telescopes",
      author: makeAuthor("u-will", "Will"),
      channel,
      guild,
      settings,
      createdTimestamp: T0 + 5,
    });

    live.push(msgA);
    const runA = bot.run(msgA, [], 0);
    await firstFetchStarted.promise;
    live.push(msgB);
    const runB = bot.run(msgB, [], 0);
    firstFetch.resolve();
    await bothHeld.promise;
    hold.resolve();
    await Promise.all([runA, runB]);

    assert.equal(sent.length, 2);
    const otter = sent.find((text) => /otters/.test(text));
    const telescope = sent.find((text) => /telescopes/.test(text));
    assert.ok(otter, "expected a reply about otters");
    assert.ok(telescope, "expected a reply about telescopes");
    assert.doesNotMatch(otter, /telescopes/);
  });

  it("does not mutate a shared people map or grow per-request instance state during a reply", async () => {
    const sharedPeople = [{ user_id: "u-a", real_name: "Ada" }];
    const client = makeClient({
      peopleByGuild: { g: sharedPeople },
    });
    const ai = client.geminiAI;
    const dbMap = client.getDatabase("g").getPeopleMap();
    const hold = deferred();
    installDelayedGemini(ai, {
      hold,
      onCall() {
        dbMap.set("u-injected", "Should not appear in snapshot");
        sharedPeople.push({ user_id: "u-injected", real_name: "Injected" });
      },
    });

    const guild = makeGuild({
      id: "g",
      name: "G",
      members: [{ id: "u-a", displayName: "Ada" }],
    });
    const live = [];
    const channel = {
      id: "c",
      nsfw: false,
      messages: {
        async fetch() {
          return collectionFromNewest(live);
        },
      },
    };
    const msg = makeMessage({
      id: "9",
      content: "<@bot-1> hello Ada",
      author: makeAuthor("u-a", "Ada"),
      channel,
      guild,
      settings: defaultSettings(),
      createdTimestamp: T0,
    });
    live.push(msg);

    const before = instanceRequestFields(ai);
    const { contents, snapshot } = await ai.buildContext(msg, null);
    const pending = ai.generateContent(contents, snapshot);
    await new Promise((resolve) => setTimeout(resolve, 10));
    hold.resolve();
    const { response } = await pending;

    assert.match(snapshot.peopleRoster, /Ada/);
    assert.doesNotMatch(snapshot.peopleRoster, /Injected/);
    assert.equal(snapshot.peopleById.get("u-injected"), undefined);
    assert.match(response, /hello Ada/);
    assert.deepEqual(instanceRequestFields(ai), before);
  });
});
