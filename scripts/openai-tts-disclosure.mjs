import fs from "node:fs";

const apiKey = process.env.OPENAI_API_KEY;
const output = process.argv[2];
const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const voice = process.env.OPENAI_TTS_VOICE || "marin";

if (!apiKey) throw new Error("OPENAI_API_KEY is required for natural disclosure narration");
if (!output) throw new Error("Usage: node scripts/openai-tts-disclosure.mjs /path/to/output.wav");

const transcript = "As an eBay Partner, I may earn a commission from qualifying purchases.";
const instructions = "Warm, organic, conversational American English. Sound like a real creator speaking naturally to viewers, not an announcer or robot. Use relaxed pacing, subtle human prosody, and clear articulation. Keep the delivery concise enough to finish in about five seconds.";

const response = await fetch("https://api.openai.com/v1/audio/speech", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    voice,
    input: transcript,
    instructions,
    response_format: "wav",
  }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`OpenAI TTS failed (${response.status}): ${body.slice(0, 500)}`);
}

const bytes = Buffer.from(await response.arrayBuffer());
if (!bytes.length) throw new Error("OpenAI TTS returned empty audio data");
fs.writeFileSync(output, bytes);
console.log(`Natural disclosure voice generated with OpenAI ${model}/${voice}: ${output}`);
