#!/usr/bin/env node
/**
 * FUR-106 personality check: dump assembled system prompts, and optionally
 * run the 6-prompt fixture against Gemini.
 *
 * Assembled prompts only (no API key):
 *   node scripts/personality-check.js
 *   node scripts/personality-check.js --all
 *
 * Live samples (stdout is markdown meant to paste into a PR comment):
 *   GEMINI_API_KEY=… node scripts/personality-check.js --live
 *   GEMINI_API_KEY=… node scripts/personality-check.js --live --all
 *
 * Key lookup: GEMINI_API_KEY, GEMINI_KEY, or <repo>/config.json geminiKey
 * (path is relative to the repo root, not the current working directory).
 *
 * --live exits 0 only when every call returns non-empty text. Failures and
 * empty replies exit 1. A missing or unreadable key exits 2.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGeminiAI } from "../modules/geminiai.js";
import { PERSONALITY_NAMES } from "../modules/guildConfigOverview.js";
import {
  PERSONALITY_CHECK_PROMPTS,
  PERSONALITY_CHECK_SAMPLE_KEYS,
} from "../test/fixtures/personality_check_prompts.js";
import roleFrame from "../modules/prompt_components/role_frame.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(REPO_ROOT, "config.json");

const live = process.argv.includes("--live");
const dumpAll = process.argv.includes("--all");

function readConfigKey() {
  if (!existsSync(CONFIG_PATH)) return { key: "", error: null };
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    const key = typeof config.geminiKey === "string" ? config.geminiKey.trim() : "";
    return { key, error: null };
  } catch (error) {
    return {
      key: "",
      error: `Could not read ${CONFIG_PATH}: ${error?.message || error}`,
    };
  }
}

function resolveGeminiKey() {
  const fromEnv =
    process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_KEY?.trim() || "";
  if (fromEnv) return { key: fromEnv, error: null };
  return readConfigKey();
}

function botDisplayName(personalityKey) {
  return PERSONALITY_NAMES[personalityKey] || "Bender";
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
  const displayName = botDisplayName(personalityKey);
  return {
    settings: { ai_selected_personality: personalityKey },
    guild: {
      id: "guild-1",
      name: "Test Guild",
      members: {
        cache: {
          get() {
            return { displayName };
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

function fence(text) {
  return `\`\`\`\n${text}\n\`\`\``;
}

function printAssembledPrompts(keys) {
  console.log("# Personality check — assembled prompts\n");
  console.log(
    "Stdout is markdown. Live samples (needs a Gemini key): `GEMINI_API_KEY=… node scripts/personality-check.js --live`\n"
  );
  console.log("## 6-prompt fixture\n");
  for (const prompt of PERSONALITY_CHECK_PROMPTS) {
    console.log(`### ${prompt.label} (\`${prompt.id}\`)\n`);
    console.log(fence(prompt.text));
    console.log("");
  }
  console.log("## Role frame (always first)\n");
  console.log(fence(roleFrame));
  console.log("");
  console.log("## Personalities\n");
  for (const key of keys) {
    const prompt = assembledPrompt(key);
    const rest = prompt.startsWith(roleFrame)
      ? prompt.slice(roleFrame.length).trim()
      : prompt;
    const personalityOnly = rest.split(" You go by many names")[0].trim();
    console.log(`### ${PERSONALITY_NAMES[key] || key} (\`${key}\`)\n`);
    console.log(fence(personalityOnly));
    console.log("");
  }
}

function extractLiveText(result) {
  const text =
    (typeof result?.text === "string" && result.text.trim()) ||
    (result?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text)
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "";
  const finishReason = result?.candidates?.[0]?.finishReason || "";
  const truncated = /MAX_TOKENS/i.test(String(finishReason));
  return { text, truncated, finishReason };
}

async function runLive(apiKey, keys) {
  const { GoogleGenAI } = await import("@google/genai");
  const genai = new GoogleGenAI({ apiKey });
  const failures = [];
  const command = dumpAll
    ? "GEMINI_API_KEY=… node scripts/personality-check.js --live --all"
    : "GEMINI_API_KEY=… node scripts/personality-check.js --live";

  console.log("# Personality check — live samples\n");
  console.log(`Command: \`${command}\`\n`);
  console.log(
    "Grouped by personality, then prompt. Paste this markdown into a PR comment.\n"
  );

  for (const key of keys) {
    const systemInstruction = assembledPrompt(key);
    console.log(`## ${PERSONALITY_NAMES[key] || key} (\`${key}\`)\n`);
    for (const prompt of PERSONALITY_CHECK_PROMPTS) {
      process.stderr.write(`  ${key} / ${prompt.id}…\n`);
      console.log(`### ${prompt.label} (\`${prompt.id}\`)\n`);
      console.log("**Prompt**\n");
      console.log(fence(prompt.text));
      console.log("");
      console.log("**Reply**\n");
      try {
        // No maxOutputTokens cap: production generateContentWithTools
        // does not set one, and 512 silently cut how-to / code samples.
        const result = await genai.models.generateContent({
          model: "gemini-flash-latest",
          contents: [{ role: "user", parts: [{ text: prompt.text }] }],
          config: { systemInstruction, temperature: 0.7 },
        });
        const { text, truncated, finishReason } = extractLiveText(result);
        if (!text) {
          failures.push(
            `${key}/${prompt.id}: empty response (${finishReason || "no finishReason"})`
          );
          console.log("_empty response_\n");
          continue;
        }
        console.log(fence(text));
        console.log("");
        if (truncated) {
          failures.push(`${key}/${prompt.id}: truncated (${finishReason})`);
          console.log(`_truncated (${finishReason})_\n`);
        }
      } catch (error) {
        const message = error?.message || String(error);
        failures.push(`${key}/${prompt.id}: ${message}`);
        console.log(`_Live call failed: ${message}_\n`);
      }
    }
  }

  if (failures.length) {
    console.error(`Live check failed (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

const keys = dumpAll
  ? Object.keys(PERSONALITY_NAMES)
  : PERSONALITY_CHECK_SAMPLE_KEYS;

if (!live) {
  printAssembledPrompts(keys);
  process.stderr.write(
    "Skipping live Gemini calls (pass --live and provide GEMINI_API_KEY / GEMINI_KEY / config.json geminiKey).\n"
  );
  process.exit(0);
}

const resolved = resolveGeminiKey();
if (resolved.error) {
  console.error(resolved.error);
  process.exit(2);
}
if (!resolved.key) {
  console.error(
    "No Gemini API key available. Live samples were not generated. Set GEMINI_API_KEY or GEMINI_KEY, or add geminiKey to config.json at the repo root."
  );
  process.exit(2);
}

await runLive(resolved.key, keys);
