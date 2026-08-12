import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tts = fs.readFileSync(new URL("./gemini-tts-disclosure.mjs", import.meta.url), "utf8");
const flow = fs.readFileSync(new URL("./notebooklm-epn-ready.sh", import.meta.url), "utf8");

const disclosure = "As an eBay Partner, I may earn a commission from qualifying purchases.";

test("natural disclosure uses Gemini warm voice and exact disclosure", () => {
  assert.match(tts, /GEMINI_API_KEY/);
  assert.match(tts, /Sulafat/);
  assert.ok(tts.includes(disclosure));
  assert.match(tts, /organic/);
});

test("production flow never falls back to eSpeak", () => {
  assert.doesNotMatch(flow.toLowerCase(), /espeak/);
  assert.match(flow, /gemini-tts-disclosure\.mjs/);
  assert.match(flow, /Refusing to render/);
});

test("production flow supports silent NotebookLM videos", () => {
  assert.match(flow, /AUDIO_STREAMS/);
  assert.match(flow, /anullsrc/);
});
