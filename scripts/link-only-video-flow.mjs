import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { put } from "@vercel/blob";
import {
  approve,
  createBufferPublisher,
  createRenderRecord,
  publishApproved,
  validateVerifiedProduct,
  STATES,
} from "../lib/video-pipeline.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const productsFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const stateFile = process.env.VIDEO_STATE_FILE ?? path.join(root, "output/video-pipeline/state.json");

const input = process.argv[2];
const productId = process.argv[3] ?? "labubu-hair-salon-vinyl-plush-pendant";
if (!input) throw new Error("Usage: node scripts/link-only-video-flow.mjs /path/to/video.mp4 [product-id]");

const absolute = path.resolve(input);
if (!fs.existsSync(absolute)) throw new Error(`Video not found: ${absolute}`);
if (!/\.mp4$/i.test(absolute)) throw new Error("Only MP4 input is supported");

for (const key of [
  "BLOB_READ_WRITE_TOKEN",
  "NEXT_PUBLIC_EPN_CAMPID",
  "BUFFER_API_TOKEN",
  "BUFFER_ORGANIZATION_ID",
]) {
  if (!String(process.env[key] ?? "").trim()) throw new Error(`${key} is required`);
}

const data = JSON.parse(fs.readFileSync(productsFile, "utf8"));
const product = (data.products ?? []).find((item) => item.id === productId);
if (!product) throw new Error(`Unknown product id: ${productId}`);
validateVerifiedProduct(product, new Date());

const ffprobe = (...args) => execFileSync("ffprobe", args, { encoding: "utf8" }).trim();
const audioIndexes = ffprobe("-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", absolute);
if (!audioIndexes) throw new Error("Source video has no audio track. This workflow never generates or alters narration.");

const duration = Number(ffprobe("-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", absolute));
if (!Number.isFinite(duration) || duration <= 0) throw new Error("Source video duration is invalid");

const disclosure = "#ad As an eBay Partner, I may earn a commission from qualifying purchases.";
const customId = `bbvideo-${product.id}-${new Date().toISOString().slice(0, 10)}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 240);
const affiliateUrl = new URL("https://www.ebay.com/sch/i.html");
affiliateUrl.searchParams.set("_nkw", product.name);
affiliateUrl.searchParams.set("mkcid", "1");
affiliateUrl.searchParams.set("mkrid", "711-53200-19255-0");
affiliateUrl.searchParams.set("siteid", "0");
affiliateUrl.searchParams.set("campid", process.env.NEXT_PUBLIC_EPN_CAMPID);
affiliateUrl.searchParams.set("toolid", "10001");
affiliateUrl.searchParams.set("mkevt", "1");
affiliateUrl.searchParams.set("customid", customId);

const channels = (process.env.VIDEO_CHANNELS ?? "tiktok").split(",").map((v) => v.trim()).filter(Boolean);
if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one service");

const facts = product.claims.slice(0, 3).map((claim) => claim.text);
const caption = `${disclosure}\n\n${product.name}\n\n${affiliateUrl.toString()}`;
const script = {
  title: product.name,
  narration: "Source narration preserved unchanged.",
  facts,
  productUrl: affiliateUrl.toString(),
  caption,
};

const now = new Date();
const record = createRenderRecord(product, script, channels, now);
const outputDir = path.join(root, "output", "video-pipeline");
fs.mkdirSync(outputDir, { recursive: true });
const renderedPath = path.join(outputDir, `${record.id}-link-only.mp4`);

const fontCandidates = ["/system/fonts/Roboto-Bold.ttf", "/system/fonts/Roboto-Regular.ttf"];
const font = fontCandidates.find((candidate) => fs.existsSync(candidate));
if (!font) throw new Error("Android Roboto font not found");

const linkStart = Math.max(6, duration - 5.5).toFixed(3);
const filter = [
  "drawbox=x=24:y=28:w=w-48:h=174:color=black@0.78:t=fill:enable='between(t,0,5.8)'",
  `drawtext=fontfile=${font}:text='#ad  As an eBay Partner,':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=50:enable='between(t,0,5.8)'`,
  `drawtext=fontfile=${font}:text='I may earn a commission from':fontcolor=white:fontsize=27:x=(w-text_w)/2:y=98:enable='between(t,0,5.8)'`,
  `drawtext=fontfile=${font}:text='qualifying purchases.':fontcolor=white:fontsize=27:x=(w-text_w)/2:y=144:enable='between(t,0,5.8)'`,
  `drawbox=x=24:y=h-150:w=w-48:h=105:color=black@0.76:t=fill:enable='gte(t,${linkStart})'`,
  `drawtext=fontfile=${font}:text='eBay affiliate link in caption':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=h-118:enable='gte(t,${linkStart})'`,
].join(",");

console.log("Rendering visual disclosure while copying source audio unchanged...");
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-i", absolute,
  "-vf", filter,
  "-map", "0:v:0", "-map", "0:a:0",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
  "-c:a", "copy",
  "-movflags", "+faststart",
  renderedPath,
], { stdio: "inherit" });

const audioCodecBefore = ffprobe("-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "default=nk=1:nw=1", absolute);
const audioCodecAfter = ffprobe("-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "default=nk=1:nw=1", renderedPath);
if (!audioCodecAfter || audioCodecAfter !== audioCodecBefore) throw new Error("Audio preservation check failed");

console.log("Uploading finished MP4 to Vercel Blob...");
const blob = await put(`video/link-only/${now.toISOString().slice(0,10)}/${path.basename(renderedPath)}`, fs.readFileSync(renderedPath), {
  access: "public",
  token: process.env.BLOB_READ_WRITE_TOKEN,
  contentType: "video/mp4",
  addRandomSuffix: true,
});
if (!blob?.url?.startsWith("https://")) throw new Error("Vercel Blob did not return a public HTTPS URL");

const ready = {
  ...record,
  state: STATES.READY,
  render: {
    provider: "notebooklm-link-only",
    id: blob.pathname ?? record.id,
    videoUrl: blob.url,
    sourceFile: path.basename(absolute),
    audioPreserved: true,
  },
  updatedAt: new Date().toISOString(),
};

// User policy: supplying/uploading the source video is the approval action.
// There is intentionally no second review prompt or approve command in this flow.
const approved = approve(ready, new Date());
const publisher = createBufferPublisher({
  token: process.env.BUFFER_API_TOKEN,
  organizationId: process.env.BUFFER_ORGANIZATION_ID,
});
const published = await publishApproved(approved, publisher, new Date());
fs.writeFileSync(stateFile, JSON.stringify(published, null, 2) + "\n");

console.log(`FINAL_STATE: ${published.state}`);
console.log(`Hosted MP4: ${published.render.videoUrl}`);
console.log(`EPN click link: ${published.script.productUrl}`);
console.log("Audio: preserved unchanged from source");
for (const [channel, result] of Object.entries(published.publications ?? {})) {
  console.log(`${channel}: ${result.status}${result.externalId ? ` (${result.externalId})` : ""}${result.error ? ` - ${result.error}` : ""}`);
}
if (published.state !== STATES.PUBLISHED) process.exitCode = 2;
