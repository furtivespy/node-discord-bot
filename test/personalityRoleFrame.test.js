import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGeminiAI } from "../modules/geminiai.js";
import roleFrame from "../modules/prompt_components/role_frame.js";
import { PERSONALITY_NAMES } from "../modules/guildConfigOverview.js";
import SetPersonality from "../slashcommands/util/setpersonality.js";
import {
  PERSONALITY_CHECK_PROMPTS,
  PERSONALITY_CHECK_SAMPLE_KEYS,
} from "./fixtures/personality_check_prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = join(__dirname, "../modules/prompt_components");

const EXPECTED_PERSONALITY_KEYS = [
  "bender",
  "detective",
  "zenmaster_nj",
  "dwarf_craftsman",
  "ship_computer",
  "educator_joy",
  "oracle_sigh",
  "shakespeare",
  "pirate_qm",
  "anxious_philosopher",
  "chicago_pope",
];

const EXPECTED_PERSONALITY_NAMES = {
  bender: "Bender",
  detective: "Hardboiled AI Detective",
  zenmaster_nj: "Zen Master (New Jersey)",
  dwarf_craftsman: "Grumpy Dwarven Craftsman",
  ship_computer: "Ship's Computer",
  educator_joy: "Enthusiastic Educator",
  oracle_sigh: "Reluctant Oracle",
  shakespeare: "Shakespearean Actor",
  pirate_qm: "Pirate Quartermaster",
  anxious_philosopher: "Anxious Philosopher",
  chicago_pope: "The Chicago Pope",
};

const DISTINCTIVE = {
  bender: "Bender from Futurama",
  detective: "hardboiled detective",
  zenmaster_nj: "Newark, New Jersey",
  dwarf_craftsman: "dwarven craftsman",
  ship_computer: "Starship Test Guild",
  educator_joy: "cheerful educator",
  oracle_sigh: "Oracle of Delphi",
  shakespeare: "Shakespearean actor",
  pirate_qm: "quartermaster of the 'Test Guild'",
  anxious_philosopher: "existential anxiety",
  chicago_pope: "Chicago Pope",
};

const FORBIDDEN_MANDATES = [
  /every answer must/i,
  /with every answer/i,
  /every user's query/i,
  /every user query/i,
  /answer every question/i,
  /every question is a cue/i,
  /most questions are flimsy/i,
  /lay the accent on thick/i,
];

function makeAi() {
  return createGeminiAI({
    config: { geminiKey: "test-key" },
    logger: { log() {}, warn() {}, error() {} },
    user: { id: "bot-id" },
    getDatabase() {
      return { listPeople: () => [] };
    },
  });
}

function makeMessage(personalityKey) {
  return {
    settings: personalityKey
      ? { ai_selected_personality: personalityKey }
      : {},
    guild: {
      id: "guild-1",
      name: "Test Guild",
      members: {
        cache: {
          get() {
            return { displayName: "Bender" };
          },
        },
      },
    },
  };
}

function personalityFiles() {
  return readdirSync(PROMPT_DIR)
    .filter((name) => name.startsWith("personality_") && name.endsWith(".js"))
    .map((name) => ({
      name,
      text: readFileSync(join(PROMPT_DIR, name), "utf8"),
    }));
}

describe("FUR-106 role frame + personality keys", () => {
  it("keeps /setpersonality keys and display names unchanged", () => {
    assert.deepEqual(Object.keys(PERSONALITY_NAMES), EXPECTED_PERSONALITY_KEYS);
    assert.deepEqual(PERSONALITY_NAMES, EXPECTED_PERSONALITY_NAMES);

    const cmd = new SetPersonality({ config: {} });
    const setSub = (cmd.data.options || []).find((option) => option.name === "set");
    const personality = (setSub.options || []).find((option) => option.name === "personality");
    const values = (personality.choices || []).map((choice) => choice.value);
    assert.deepEqual(values.sort(), EXPECTED_PERSONALITY_KEYS.slice().sort());
  });

  it("puts the role frame first in getSystemInstructions for every personality, including Bender", () => {
    const ai = makeAi();
    for (const key of EXPECTED_PERSONALITY_KEYS) {
      const instructions = ai.getSystemInstructions(makeMessage(key));
      assert.ok(
        instructions.startsWith(roleFrame),
        `${key} system instructions should start with the role frame`
      );
      const distinctive = DISTINCTIVE[key];
      const frameEnd = roleFrame.length;
      const distinctiveAt = instructions.toLowerCase().indexOf(distinctive.toLowerCase());
      assert.ok(distinctiveAt >= 0, `${key} should include distinctive text "${distinctive}"`);
      assert.ok(
        distinctiveAt >= frameEnd,
        `${key} personality text should come after the role frame`
      );
    }
  });

  it("uses the role frame first when the personality key is missing or unknown", () => {
    const ai = makeAi();
    for (const key of [undefined, "not_a_real_personality"]) {
      const instructions = ai.getSystemInstructions(makeMessage(key));
      assert.ok(instructions.startsWith(roleFrame));
      assert.match(instructions, /Bender from Futurama/);
    }
  });

  it("does not give any personality an every-answer-must rule", () => {
    const files = personalityFiles();
    assert.equal(files.length, EXPECTED_PERSONALITY_KEYS.length);
    for (const file of files) {
      for (const pattern of FORBIDDEN_MANDATES) {
        assert.equal(
          pattern.test(file.text),
          false,
          `${file.name} should not contain ${pattern}`
        );
      }
    }
  });

  it("talks to people in the chat instead of a 1:1 user, except Bender's short tone card", () => {
    for (const file of personalityFiles()) {
      if (file.name === "personality_bender.js") continue;
      assert.equal(
        /\bthe user\b/i.test(file.text),
        false,
        `${file.name} should say "people in the chat", not "the user"`
      );
      assert.match(
        file.text,
        /people in the chat/,
        `${file.name} should mention people in the chat`
      );
      assert.match(file.text, /Who you are:/);
      assert.match(file.text, /How the flavor shows up:/);
      assert.match(file.text, /Never:/);
    }
  });

  it("ships the 6-prompt fixture covering the FUR-106 pass-bar cases", () => {
    const ids = PERSONALITY_CHECK_PROMPTS.map((prompt) => prompt.id);
    assert.deepEqual(ids, ["factual", "howto", "code", "banter", "thread", "bad_day"]);
    assert.ok(PERSONALITY_CHECK_SAMPLE_KEYS.includes("chicago_pope"));
    assert.ok(PERSONALITY_CHECK_SAMPLE_KEYS.includes("anxious_philosopher"));
    assert.equal(PERSONALITY_CHECK_SAMPLE_KEYS.length >= 4, true);
    for (const prompt of PERSONALITY_CHECK_PROMPTS) {
      assert.ok(prompt.text.includes("(id: <@"));
    }
  });
});
