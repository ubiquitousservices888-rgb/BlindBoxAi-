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
  assert.match(tts, /organic/i);
});

test("production flow uses Gemini TTS and has no executable eSpeak fallback", () => {
  assert.match(flow, /gemini-tts-disclosure\.mjs/);
  assert.match(flow, /refusing to render/i);

  // Comments may mention eSpeak to document the prohibition. Reject only an
  // executable eSpeak dependency/invocation, not explanatory text.
  assert.doesNotMatch(flow, /^\s*(?:command\s+-v\s+)?espeak(?:\s|$)/im);
  assert.doesNotMatch(flow, /\bespeak\s+-w\b/i);
});

test("production flow supports silent NotebookLM videos", () => {
  assert.match(flow, /audio_streams/i);
  assert.match(flow, /anullsrc/i);
});
