import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import {
  createRenderRecord,
  DISCLOSURE,
  generateVideoScript,
  markRendered,
  selectDailyProduct,
} from "../lib/video-pipeline.mjs";
import { hardenGenerativeVideoScript } from "../lib/epn-genai-safety.mjs";
import { renderGeminiOmni } from "../lib/gemini-video-renderer.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dataFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const stateFile = process.env.VIDEO_STATE_FILE ?? path.join(root, "output/video-pipeline/state.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (value) => {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(value, null, 2) + "\n");
};

if (process.env.ALLOW_MANUAL_VIDEO_RENDER !== "true") {
  throw new Error("Video rendering is paused. Set ALLOW_MANUAL_VIDEO_RENDER=true only for an owner-reviewed render run.");
}
if (process.env.ALLOW_GEMINI_VIDEO_RENDER !== "true") {
  throw new Error("Gemini Omni rendering is disabled. Set ALLOW_GEMINI_VIDEO_RENDER=true only for an approved test run.");
}
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required to host the rendered MP4");

const now = new Date();
const products = read(dataFile).products ?? [];
const product = selectDailyProduct(products, now);
const channels = (process.env.VIDEO_CHANNELS ?? "twitter,tiktok")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one Buffer service");

const script = hardenGenerativeVideoScript(generateVideoScript(product, now), DISCLOSURE);
const record = createRenderRecord(product, script, channels, now);
const rendered = await renderGeminiOmni({
  apiKey: process.env.GEMINI_API_KEY,
  record,
  resolution: process.env.GEMINI_VIDEO_RESOLUTION ?? "360p",
  uploadVideo: async ({ bytes, filename, contentType }) => put(`generated-video/${filename}`, bytes, {
    access: "public",
    addRandomSuffix: true,
    contentType,
    multipart: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }),
});

const ready = markRendered(record, { id: rendered.id, videoUrl: rendered.videoUrl });
ready.render = {
  ...ready.render,
  provider: "gemini-omni",
  model: rendered.model,
  resolution: rendered.resolution,
};
write(ready);
console.log(`READY_FOR_REVIEW: ${ready.id}`);
console.log(`VIDEO_RENDER_PROVIDER: ${ready.render.provider}`);
console.log("Publishing remains blocked until the existing approve command is run.");
