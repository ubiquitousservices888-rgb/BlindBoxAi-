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
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
      assert.equal(options.headers["x-goog-api-key"], "test-key");
      assert.ok(options.signal, "Network timeout must be provided");
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          id: "interaction-123",
          status: "completed",
          model: "gemini-omni-1.1-flash",
          steps: [{
            type: "model_output",
            content: [{ type: "video", mime_type: "video/mp4",
              data: Buffer.from("not-a-real-video-but-enough-test-bytes-1234567890").toString("base64") }],
          }],
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

test("Gemini REST text-only response is rejected without uploading or silent fallback", async () => {
  let uploadCalls = 0;
  await assert.rejects(
    () => renderGeminiOmni({
      apiKey: "fixture-only",
      record,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          id: "v1-text",
          status: "completed",
          model: "gemini-3.8-flash",
          steps: [{ type: "model_output", content: [{ type: "text", text: "no MP4" }] }],
        }),
      }),
      uploadVideo: async () => { uploadCalls++; return { url: "https://example.com/out.mp4" }; },
    }),
    /expected model/,
  );
  assert.equal(uploadCalls, 0);
});

test("Gemini REST incomplete and ambiguous video responses fail closed", async () => {
  const video = Buffer.from("example-mp4-binary-payload-123456").toString("base64");
  for (const scenario of [
    { status: "incomplete", steps: [] },
    { status: "completed", steps: [{ type: "model_output", content: [
      { type: "video", mime_type: "video/mp4", data: video },
      { type: "video", mime_type: "video/mp4", data: video },
    ] }] },
  ]) {
    let uploadCalls = 0;
    await assert.rejects(() => renderGeminiOmni({
      apiKey: "fixture-only",
      record,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ model: "gemini-omni-1.1-flash", ...scenario }),
      }),
      uploadVideo: async () => { uploadCalls++; return { url: "https://example.com/out.mp4" }; },
    }));
    assert.equal(uploadCalls, 0);
  }
});

test("Gemini rate limit fails closed without retrying potentially billable renders", async () => {
  let apiCalls = 0;
  await assert.rejects(() => renderGeminiOmni({
    apiKey: "fixture-only",
    record,
    fetchImpl: async () => { apiCalls++; return { ok: false, status: 429 }; },
    uploadVideo: async () => { throw new Error("must not upload"); },
  }), /failed: 429/);
  assert.equal(apiCalls, 1);
});
