import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import {
  createRenderRecord,
  generateVideoScript,
  selectDailyProduct,
  validateVerifiedProduct,
  STATES,
} from "../lib/video-pipeline.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const productsFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const stateFile = process.env.VIDEO_STATE_FILE ?? path.join(root, "output/video-pipeline/state.json");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : process.argv[i + 1];
};

const filePath = arg("file");
const requestedProductId = arg("product");
const token = process.env.VIDEO_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

if (!filePath) throw new Error("Usage: npm run video:notebooklm -- --file /path/to/video.mp4 [--product PRODUCT_ID]");
if (!token) throw new Error("VIDEO_BLOB_READ_WRITE_TOKEN (preferred) or BLOB_READ_WRITE_TOKEN is required. Pull it into .env.local before ingest.");

const absoluteFile = path.resolve(filePath);
if (!fs.existsSync(absoluteFile)) throw new Error(`Video not found: ${absoluteFile}`);
if (!/\.mp4$/i.test(absoluteFile)) throw new Error("NotebookLM ingest currently accepts MP4 files only");

const stat = fs.statSync(absoluteFile);
if (!stat.isFile() || stat.size === 0) throw new Error("Video file is empty or invalid");

const dataset = JSON.parse(fs.readFileSync(productsFile, "utf8"));
const products = dataset.products ?? [];
const now = new Date();

let product;
if (requestedProductId) {
  product = products.find((candidate) => candidate.id === requestedProductId);
  if (!product) throw new Error(`Unknown product id: ${requestedProductId}`);
  validateVerifiedProduct(product, now);
} else {
  product = selectDailyProduct(products, now);
}

const channels = (process.env.VIDEO_CHANNELS ?? "tiktok,instagram,facebook,twitter")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one Buffer service");

const script = generateVideoScript(product, now);
const record = createRenderRecord(product, script, channels, now);

const safeName = path.basename(absoluteFile).replace(/[^a-zA-Z0-9._-]/g, "-");
const pathname = `video/notebooklm/${now.toISOString().slice(0, 10)}/${record.id}-${safeName}`;
const body = fs.readFileSync(absoluteFile);

console.log(`Uploading ${safeName} (${(stat.size / 1024 / 1024).toFixed(1)} MB) to Vercel Blob...`);
const blob = await put(pathname, body, {
  access: "public",
  token,
  contentType: "video/mp4",
  addRandomSuffix: true,
  multipart: stat.size > 100 * 1024 * 1024,
});

if (!blob?.url?.startsWith("https://")) throw new Error("Vercel Blob did not return a public HTTPS URL");

const ready = {
  ...record,
  state: STATES.READY,
  render: {
    provider: "notebooklm",
    id: blob.pathname ?? pathname,
    videoUrl: blob.url,
    sourceFile: safeName,
    bytes: stat.size,
  },
  updatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify(ready, null, 2) + "\n");

console.log(`READY_FOR_REVIEW: ${ready.id}`);
console.log(`Hosted MP4: ${ready.render.videoUrl}`);
console.log(`CTA: ${ready.script.productUrl}`);
console.log("Next: review the video, then run npm run video:approve followed by npm run video:publish.");
