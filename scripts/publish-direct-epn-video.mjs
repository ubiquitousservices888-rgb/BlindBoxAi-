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
const shareMode = args.includes("--now") ? "shareNow" : "addToQueue";
const publicBase = String(process.env.VIDEO_PUBLIC_BASE_URL || "https://www.blindboxai.com").replace(/\/$/, "");
const services = (process.env.VIDEO_CHANNELS || "youtube,tiktok,twitter")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

for (const key of ["BUFFER_API_TOKEN", "BUFFER_ORGANIZATION_ID", "NEXT_PUBLIC_EPN_CAMPID"]) {
  if (!String(process.env[key] ?? "").trim()) throw new Error(`${key} is required`);
}
if (!services.length) throw new Error("VIDEO_CHANNELS must include at least one Buffer service");
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
const videoId = `bb1-${querySlug}-${dateSlug}-${fileHash}`.slice(0, 220);
const publishedName = `${videoId}.mp4`;
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

const videoUrl = `${publicBase}/published-videos/${encodeURIComponent(publishedName)}`;
console.log(`Unique video ID: ${videoId}`);
console.log(`Buffer mode: ${shareMode}`);
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

const channelsData = await bufferGraphQL(
  process.env.BUFFER_API_TOKEN,
  `query Channels($organizationId: OrganizationId!) {
    channels(input: { organizationId: $organizationId, filter: { isLocked: false } }) {
      id name displayName service isQueuePaused isDisconnected isLocked
    }
  }`,
  { organizationId: process.env.BUFFER_ORGANIZATION_ID },
);

const allChannels = channelsData?.channels ?? [];
const targets = [];
for (const service of services) {
  const matches = allChannels.filter((channel) =>
    channel.service === service &&
    !channel.isDisconnected &&
    !channel.isLocked &&
    !channel.isQueuePaused
  );
  if (matches.length !== 1) {
    throw new Error(`${service}: expected exactly one active Buffer channel, found ${matches.length}`);
  }
  targets.push(matches[0]);
}

const disclosure = "#ad As an eBay Partner, I may earn a commission from qualifying purchases.";
const results = [];

for (const target of targets) {
  const channelCustomId = `${videoId}-${slugify(target.service)}`.slice(0, 240);
  const epn = new URL("https://www.ebay.com/sch/i.html");
  epn.searchParams.set("_nkw", query);
  epn.searchParams.set("mkcid", "1");
  epn.searchParams.set("mkrid", "711-53200-19255-0");
  epn.searchParams.set("siteid", "0");
  epn.searchParams.set("campid", process.env.NEXT_PUBLIC_EPN_CAMPID);
  epn.searchParams.set("toolid", "10001");
  epn.searchParams.set("mkevt", "1");
  epn.searchParams.set("customid", channelCustomId);

  const caption = `${disclosure}\n\n${hook}\n\n${epn.toString()}`;

  try {
    const data = await bufferGraphQL(
      process.env.BUFFER_API_TOKEN,
      `mutation CreateVideo($text: String!, $channelId: ChannelId!, $videoUrl: String!, $mode: ShareMode!) {
        createPost(input: {
          text: $text
          channelId: $channelId
          schedulingType: automatic
          mode: $mode
          assets: [{ video: { url: $videoUrl } }]
        }) {
          ... on PostActionSuccess { post { id text status channelId } }
          ... on MutationError { message }
        }
      }`,
      { text: caption, channelId: target.id, videoUrl, mode: shareMode },
    );

    if (data?.createPost?.message) throw new Error(data.createPost.message);
    const post = data?.createPost?.post;
    if (!post?.id) throw new Error("Buffer returned no post ID");

    results.push({
      service: target.service,
      channel: target.displayName || target.name,
      channelId: target.id,
      postId: post.id,
      status: post.status,
      epnUrl: epn.toString(),
      customId: channelCustomId,
      ok: true,
    });
  } catch (error) {
    results.push({
      service: target.service,
      channel: target.displayName || target.name,
      channelId: target.id,
      error: error.message,
      ok: false,
    });
  }
}

console.log("\n=== BUFFER MULTI-CHANNEL RESULTS ===");
for (const result of results) {
  if (result.ok) {
    console.log(`${result.service}: ${result.channel}`);
    console.log(`  BUFFER_POST_CREATED: ${result.postId}`);
    console.log(`  BUFFER_STATUS: ${result.status}`);
    console.log(`  CHANNEL_ID: ${result.channelId}`);
    console.log(`  EPN_CUSTOM_ID: ${result.customId}`);
    console.log(`  EPN_URL: ${result.epnUrl}`);
  } else {
    console.log(`${result.service}: ${result.channel}`);
    console.log(`  FAILED: ${result.error}`);
  }
}
console.log("Original NotebookLM audio preserved: yes");

if (results.some((result) => !result.ok)) process.exitCode = 2;
