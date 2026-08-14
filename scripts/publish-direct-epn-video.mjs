import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { bufferGraphQL } from "../lib/daily-product-pipeline.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const slugify = (value) => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60) || "video";

const inputArg = arg("file");
if (!inputArg) throw new Error("--file is required");
const input = path.resolve(inputArg);
const query = arg("query", path.basename(input, path.extname(input)));
const hook = arg("hook", "Check current related listings on eBay.");
const channelId = arg("channel-id", "6a79f6b2b2d9d577434f3e44");
const publicBase = String(process.env.VIDEO_PUBLIC_BASE_URL || "https://www.blindboxai.com").replace(/\/$/, "");

for (const key of ["BUFFER_API_TOKEN", "NEXT_PUBLIC_EPN_CAMPID"]) {
  if (!String(process.env[key] ?? "").trim()) throw new Error(`${key} is required`);
}
if (!fs.existsSync(input)) throw new Error(`Video not found: ${input}`);
if (!/\.mp4$/i.test(input)) throw new Error("Only MP4 input is supported");

const ffprobeJson = (file) => JSON.parse(execFileSync("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height",
  "-of", "json",
  file,
], { encoding: "utf8" }));

const source = ffprobeJson(input);
if (!(source.streams ?? []).some((s) => s.codec_type === "audio")) {
  throw new Error("Source video has no audio track; refusing because this workflow must preserve existing NotebookLM audio");
}
const video = (source.streams ?? []).find((s) => s.codec_type === "video");
if (!video?.width || !video?.height) throw new Error("Source video dimensions are unavailable");

const fontCandidates = [
  "/system/fonts/Roboto-Bold.ttf",
  "/system/fonts/Roboto-Regular.ttf",
  "/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];
const font = fontCandidates.find((f) => fs.existsSync(f));
if (!font) throw new Error("No supported font found for the disclosure overlay");
const boxWidth = Math.max(240, video.width - 48);

const fileHash = crypto.createHash("sha256").update(fs.readFileSync(input)).digest("hex").slice(0, 8);
const querySlug = slugify(query);
const dateSlug = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const customId = `bb1-${querySlug}-${dateSlug}-${fileHash}`.slice(0, 240);
const publishedName = `${customId}.mp4`;
const publicDir = path.join(process.cwd(), "public", "published-videos");
fs.mkdirSync(publicDir, { recursive: true });
const output = path.join(publicDir, publishedName);

const filter = [
  `drawbox=x=24:y=24:w=${boxWidth}:h=150:color=black@0.72:t=fill:enable='between(t,0,5.5)'`,
  `drawtext=fontfile='${font}':text='#ad - As an eBay Partner,':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=48:enable='between(t,0,5.5)'`,
  `drawtext=fontfile='${font}':text='I may earn a commission from':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=88:enable='between(t,0,5.5)'`,
  `drawtext=fontfile='${font}':text='qualifying purchases.':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=126:enable='between(t,0,5.5)'`,
].join(",");

console.log("Rendering visual disclosure; source audio will be stream-copied unchanged...");
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-i", input,
  "-vf", filter,
  "-map", "0:v:0", "-map", "0:a:0",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
  "-c:a", "copy",
  "-movflags", "+faststart",
  output,
], { stdio: "inherit" });

const rendered = ffprobeJson(output);
const sourceAudio = (source.streams ?? []).find((s) => s.codec_type === "audio")?.codec_name;
const renderedAudio = (rendered.streams ?? []).find((s) => s.codec_type === "audio")?.codec_name;
if (!renderedAudio || renderedAudio !== sourceAudio) throw new Error("Audio preservation check failed");

const epn = new URL("https://www.ebay.com/sch/i.html");
epn.searchParams.set("_nkw", query);
epn.searchParams.set("mkcid", "1");
epn.searchParams.set("mkrid", "711-53200-19255-0");
epn.searchParams.set("siteid", "0");
epn.searchParams.set("campid", process.env.NEXT_PUBLIC_EPN_CAMPID);
epn.searchParams.set("toolid", "10001");
epn.searchParams.set("mkevt", "1");
epn.searchParams.set("customid", customId);

const caption = `#ad As an eBay Partner, I may earn a commission from qualifying purchases.\n\n${hook}\n\n${epn.toString()}`;
const videoUrl = `${publicBase}/published-videos/${encodeURIComponent(publishedName)}`;

console.log(`Unique video ID: ${customId}`);
console.log("Deploying public video with the linked BlindBoxAI Vercel project...");
execFileSync("npx", ["--yes", "vercel@latest", "deploy", "--prod", "--yes"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

let reachable = false;
for (let i = 0; i < 12; i++) {
  try {
    const response = await fetch(videoUrl, { method: "HEAD", redirect: "follow" });
    if (response.ok) { reachable = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 2500));
}
if (!reachable) throw new Error(`Deployed video is not publicly reachable: ${videoUrl}`);

console.log(`Hosted MP4: ${videoUrl}`);
console.log(`EPN URL: ${epn.toString()}`);

const data = await bufferGraphQL(
  process.env.BUFFER_API_TOKEN,
  `mutation CreateVideo($text: String!, $channelId: ChannelId!, $videoUrl: String!) {
    createPost(input: {
      text: $text
      channelId: $channelId
      schedulingType: automatic
      mode: addToQueue
      assets: [{ video: { url: $videoUrl } }]
    }) {
      ... on PostActionSuccess { post { id text status channelId } }
      ... on MutationError { message }
    }
  }`,
  { text: caption, channelId, videoUrl },
);

if (data?.createPost?.message) throw new Error(`Buffer publish failed: ${data.createPost.message}`);
const post = data?.createPost?.post;
if (!post?.id) throw new Error("Buffer publish returned no post ID");

console.log(`BUFFER_POST_CREATED: ${post.id}`);
console.log(`BUFFER_STATUS: ${post.status}`);
console.log(`CHANNEL_ID: ${post.channelId}`);
console.log("Original NotebookLM audio preserved: yes");
