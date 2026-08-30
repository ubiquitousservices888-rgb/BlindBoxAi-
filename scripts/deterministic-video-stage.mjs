import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createRenderRecord,
  generateVideoScript,
  markRendered,
  selectDailyProduct,
} from "../lib/video-pipeline.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dataFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const stateFile = process.env.VIDEO_STATE_FILE ?? path.join(root, "output/video-pipeline/state.json");
const outputDir = path.dirname(stateFile);
const releaseTag = process.env.VIDEO_ASSET_RELEASE_TAG || "blindbox-video-assets";
const repository = process.env.GITHUB_REPOSITORY || "ubiquitousservices888-rgb/BlindBoxAi-";
const fontFile = process.env.VIDEO_FONT_FILE || "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

if (process.env.ALLOW_MANUAL_VIDEO_RENDER !== "true") {
  throw new Error("Video rendering is paused. Set ALLOW_MANUAL_VIDEO_RENDER=true only for an owner-reviewed render run.");
}
if (!fs.existsSync(fontFile)) throw new Error(`Video font file not found: ${fontFile}`);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wrapCardText(value, width = 28, maxLines = 7) {
  const words = cleanText(value).split(" ").filter(Boolean);
  if (!words.length) return "";

  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word.length <= width ? word : `${word.slice(0, Math.max(1, width - 1))}…`;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, width - 1)).trimEnd()}…`;
  }
  return lines.slice(0, maxLines).join("\n");
}

function filterPath(file) {
  return file.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function drawText({ file, size, y, start, end, color = "white" }) {
  return [
    `drawtext=fontfile='${filterPath(fontFile)}'`,
    `textfile='${filterPath(file)}'`,
    `fontcolor=${color}`,
    `fontsize=${size}`,
    "line_spacing=12",
    "x=(w-text_w)/2",
    `y=${y}`,
    "box=1",
    "boxcolor=black@0.28",
    "boxborderw=22",
    `enable='between(t,${start},${end})'`,
  ].join(":");
}

const now = new Date();
const products = readJson(dataFile).products ?? [];
const product = selectDailyProduct(products, now);
const channels = (process.env.VIDEO_CHANNELS ?? "youtube,tiktok")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one Buffer service");

const script = generateVideoScript(product, now);
const record = createRenderRecord(product, script, channels, now);
const filename = `${record.id}-verified.mp4`.replace(/[^A-Za-z0-9._-]/g, "-");
const videoFile = path.join(outputDir, filename);
const videoUrl = `https://github.com/${repository}/releases/download/${releaseTag}/${filename}`;

fs.mkdirSync(outputDir, { recursive: true });
const cardsDir = path.join(outputDir, "cards");
fs.mkdirSync(cardsDir, { recursive: true });

const cards = {
  brand: "BlindBoxAI\nVERIFIED COLLECTOR CHECK",
  title: wrapCardText(product.name, 24, 6),
  fact1: wrapCardText(script.facts?.[0] || "Verified source check complete.", 28, 7),
  fact2: wrapCardText(script.facts?.[1] || "Review the source details before buying.", 28, 7),
  fact3: wrapCardText(script.facts?.[2] || "Compare condition and seller history.", 28, 7),
  cta: "Research before you buy\nBlindBoxAI.com\n#ad · affiliate disclosure",
};

const cardFiles = {};
for (const [name, text] of Object.entries(cards)) {
  const file = path.join(cardsDir, `${name}.txt`);
  fs.writeFileSync(file, `${text}\n`);
  cardFiles[name] = file;
}

const filter = [
  "drawbox=x=36:y=72:w=648:h=7:color=0x8de6d1@0.95:t=fill",
  "drawbox=x=36:y=1198:w=648:h=7:color=white@0.35:t=fill",
  drawText({ file: cardFiles.brand, size: 30, y: 125, start: 0, end: 15, color: "0x8de6d1" }),
  drawText({ file: cardFiles.title, size: 50, y: "(h-text_h)/2", start: 0.2, end: 3.1 }),
  drawText({ file: cardFiles.fact1, size: 39, y: "(h-text_h)/2", start: 3.2, end: 6.2 }),
  drawText({ file: cardFiles.fact2, size: 39, y: "(h-text_h)/2", start: 6.3, end: 9.3 }),
  drawText({ file: cardFiles.fact3, size: 39, y: "(h-text_h)/2", start: 9.4, end: 12.4 }),
  drawText({ file: cardFiles.cta, size: 48, y: "(h-text_h)/2", start: 12.5, end: 14.95, color: "0x8de6d1" }),
  "fade=t=in:st=0:d=0.25",
  "fade=t=out:st=14.6:d=0.4",
].join(",");

const args = [
  "-hide_banner",
  "-loglevel", "error",
  "-y",
  "-f", "lavfi",
  "-i", "color=c=0x111827:s=720x1280:r=30:d=15",
  "-f", "lavfi",
  "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
  "-vf", filter,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "24",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "96k",
  "-shortest",
  "-movflags", "+faststart",
  videoFile,
];

const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Deterministic ffmpeg render failed with exit code ${result.status}`);

const stats = fs.statSync(videoFile);
if (stats.size < 10_000) throw new Error("Deterministic video output is unexpectedly small");

const ready = markRendered(record, {
  id: `deterministic-${record.id}`,
  videoUrl,
}, now);
ready.render = {
  ...ready.render,
  provider: "deterministic-ffmpeg",
  assetFilename: filename,
  releaseTag,
  bytes: stats.size,
};
writeJson(stateFile, ready);

console.log(`READY_FOR_REVIEW: ${ready.id}`);
console.log(`VIDEO_RENDER_PROVIDER: ${ready.render.provider}`);
console.log(`VIDEO_FILE: ${videoFile}`);
console.log(`VIDEO_URL: ${videoUrl}`);
console.log("Publishing remains blocked until the protected owner approval gate is satisfied.");
