import test from "node:test";
import assert from "node:assert/strict";
import { buildGeminiVideoPrompt, renderGeminiOmni } from "../lib/gemini-video-renderer.mjs";

const record = {
  id: "2026-08-29-test-product",
  script: {
    title: "Test Collectible",
    facts: ["Verified fact one.", "Verified fact two."],
  },
};

test("Gemini prompt is constrained to verified claims and no merchant URLs", () => {
  const prompt = buildGeminiVideoPrompt(record);
  assert.match(prompt, /Verified fact one/);
  assert.match(prompt, /Do not invent prices/);
  assert.match(prompt, /BlindBoxAI\.com/);
  assert.doesNotMatch(prompt, /amazon\.com/i);
});

test("Gemini renderer requests vertical video and uploads returned MP4 bytes", async () => {
  let requestBody;
  let uploaded;
  const result = await renderGeminiOmni({
    apiKey: "test-key",
    record,
    resolution: "360p",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          id: "interaction-123",
          output_video: { data: Buffer.from("not-a-real-video-but-enough-test-bytes-1234567890").toString("base64") },
        }),
      };
    },
    uploadVideo: async (value) => {
      uploaded = value;
      return { url: "https://example.public.blob.vercel-storage.com/test-video.mp4" };
    },
  });

  assert.equal(requestBody.model, "gemini-omni-1.1-flash");
  assert.equal(requestBody.response_format.aspect_ratio, "9:16");
  assert.equal(requestBody.response_format.resolution, "360p");
  assert.equal(uploaded.contentType, "video/mp4");
  assert.ok(uploaded.bytes.length > 0);
  assert.equal(result.provider, "gemini-omni");
  assert.match(result.videoUrl, /^https:\/\//);
});

test("Gemini renderer rejects unsupported resolution", async () => {
  await assert.rejects(
    () => renderGeminiOmni({ apiKey: "x", record, resolution: "8k", uploadVideo: async () => ({}) }),
    /resolution must be/,
  );
});
