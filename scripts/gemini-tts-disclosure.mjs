import fs from "node:fs";

const apiKey = process.env.GEMINI_API_KEY;
const output = process.argv[2];
const voice = process.env.GEMINI_TTS_VOICE || "Sulafat";
const model = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";

if (!apiKey) throw new Error("GEMINI_API_KEY is required for natural disclosure narration");
if (!output) throw new Error("Usage: node scripts/gemini-tts-disclosure.mjs /path/to/output.wav");

const transcript = "As an eBay Partner, I may earn a commission from qualifying purchases.";
const prompt = `Synthesize only the spoken transcript below. Do not read these directions aloud.\n\nDelivery: warm, natural, relaxed, conversational American English. Sound like a real creator speaking to viewers, not an announcer or robot. Use subtle human pacing, gentle confidence, and natural prosody. Keep it clear and concise.\n\nSpoken transcript:\n${transcript}`;

function writeWav(filename, pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(filename, Buffer.concat([header, pcm]));
}

async function generate(attempt = 1) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (attempt < 3 && response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      return generate(attempt + 1);
    }
    throw new Error(`Gemini TTS failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const json = await response.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((item) => item?.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini TTS returned no audio data");
  const pcm = Buffer.from(part.inlineData.data, "base64");
  if (!pcm.length) throw new Error("Gemini TTS returned empty audio data");
  writeWav(output, pcm);
  console.log(`Natural disclosure voice generated with ${voice}: ${output}`);
}

await generate();
