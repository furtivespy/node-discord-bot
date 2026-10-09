#!/usr/bin/env node
/**
 * FUR-106 personality check: dump assembled system prompts, and optionally
 * run the 6-prompt fixture against Gemini.
 *
 *   node scripts/personality-check.js
 *   GEMINI_API_KEY=... node scripts/personality-check.js --live
 *
 * Looks for a key in GEMINI_API_KEY, GEMINI_KEY, or ./config.json geminiKey.
 * Live samples are written to stdout. Without a key, prints assembled prompts
 * only so reviewers can still inspect the role frame + personality text.
 */
import { readFileSync, existsSync } from "node:fs";
import { createGeminiAI } from "../modules/geminiai.js";
import { PERSONALITY_NAMES } from "../modules/guildConfigOverview.js";
import {
  PERSONALITY_CHECK_PROMPTS,
  PERSONALITY_CHECK_SAMPLE_KEYS,
} from "../test/fixtures/personality_check_prompts.js";
import roleFrame from "../modules/prompt_components/role_frame.js";

const live = process.argv.includes("--live");
const dumpAll = process.argv.includes("--all");

function readConfigKey() {
  if (!existsSync("./config.json")) return "";
  try {
    const config = JSON.parse(readFileSync("./config.json", "utf8"));
    return typeof config.geminiKey === "string" ? config.geminiKey.trim() : "";
  } catch {
    return "";
  }
}

function resolveGeminiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GEMINI_KEY?.trim() ||
    readConfigKey()
  );
}

function makeClient(apiKey = "test-key") {
  return {
    config: { geminiKey: apiKey },
    logger: { log() {}, warn() {}, error() {} },
    user: { id: "bot-id" },
    getDatabase() {
      return { listPeople: () => [] };
    },
  };
}

function makeMessage(personalityKey) {
  return {
    settings: { ai_selected_personality: personalityKey },
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

function assembledPrompt(personalityKey) {
  const ai = createGeminiAI(makeClient());
  return ai.getSystemInstructions(makeMessage(personalityKey));
}

function printAssembledPrompts(keys) {
  console.log("# 6-prompt fixture\n");
  for (const prompt of PERSONALITY_CHECK_PROMPTS) {
    console.log(`## ${prompt.label} (\`${prompt.id}\`)\n`);
    console.log(prompt.text);
    console.log("");
  }
  console.log("# Assembled system prompts (FUR-106)\n");
  console.log("Role frame (always first):\n");
  console.log(roleFrame);
  console.log("");
  for (const key of keys) {
    const prompt = assembledPrompt(key);
    const rest = prompt.startsWith(roleFrame)
      ? prompt.slice(roleFrame.length).trim()
      : prompt;
    const personalityOnly = rest.split(" You go by many names")[0].trim();
    console.log(`## ${PERSONALITY_NAMES[key] || key} (\`${key}\`)\n`);
    console.log(personalityOnly);
    console.log("");
  }
}

async function runLive(apiKey, keys) {
  const { GoogleGenAI } = await import("@google/genai");
  const genai = new GoogleGenAI({ apiKey });
  console.log("# Live 6-prompt samples\n");
  for (const key of keys) {
    const systemInstruction = assembledPrompt(key);
    console.log(`## ${PERSONALITY_NAMES[key] || key} (\`${key}\`)\n`);
    for (const prompt of PERSONALITY_CHECK_PROMPTS) {
      process.stderr.write(`  ${key} / ${prompt.id}…\n`);
      try {
        const result = await genai.models.generateContent({
          model: "gemini-flash-latest",
          contents: [{ role: "user", parts: [{ text: prompt.text }] }],
          config: { systemInstruction, temperature: 0.7, maxOutputTokens: 512 },
        });
        const text =
          (typeof result?.text === "string" && result.text.trim()) ||
          (result?.candidates?.[0]?.content?.parts || [])
            .map((part) => part.text)
            .filter(Boolean)
            .join(" ")
            .trim() ||
          "(empty response)";
        console.log(`### ${prompt.label} (\`${prompt.id}\`)\n`);
        console.log(prompt.text);
        console.log("");
        console.log(text);
        console.log("");
      } catch (error) {
        console.log(`### ${prompt.label} (\`${prompt.id}\`)\n`);
        console.log(`Live call failed: ${error?.message || error}`);
        console.log("");
      }
    }
  }
}

const keys = dumpAll
  ? Object.keys(PERSONALITY_NAMES)
  : PERSONALITY_CHECK_SAMPLE_KEYS;

printAssembledPrompts(keys);

if (!live) {
  console.log(
    "Skipping live Gemini calls (pass --live and provide GEMINI_API_KEY / GEMINI_KEY / config.json geminiKey)."
  );
  process.exit(0);
}

const apiKey = resolveGeminiKey();
if (!apiKey) {
  console.error(
    "No Gemini API key available. Live samples were not generated."
  );
  process.exit(2);
}

await runLive(apiKey, keys);
