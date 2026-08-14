import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { put } from "@vercel/blob";
import { bufferGraphQL } from "../lib/daily-product-pipeline.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const input = path.resolve(arg("file"));
const query = arg("query", "Labubu authentic nine teeth");
const hook = arg("hook", "The nine-teeth rule can help flag suspicious Labubu figures.");
const channelId = arg("channel-id", "6a79f6b2b2d9d577434f3e44");
const output = input.replace(/\.mp4$/i, " - EPN Ready.mp4");

for (const key of ["BLOB_READ_WRITE_TOKEN", "BUFFER_API_TOKEN", "BUFFER_ORGANIZATION_ID", "NEXT_PUBLIC_EPN_CAMPID"]) {
  if (!String(process.env[key] ?? "").trim()) throw new Error(`${key} is required`);
}
if (!input || !fs.existsSync(input)) throw new Error(`Video not found: ${input}`);
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

const filter = [
  `drawbox=x=24:y=24:w=${boxWidth}:h=150:color=black@0.72:t=fill:enable='between(t,0,5.5)'`,
  `drawtext=fontfile='${font}':text='#ad - As an eBay Partner,':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=48:enable='between(t,0,5.5)'`,
  `drawtext=fontfile='${font}':text='I may earn a commission from':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=88:enable='between(t,0,5.5)'`,
  `drawtext=fontfile='${font}':text='qualifying purchases.':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=126:enable='between(t,0,5.5)'`,
].join(",");

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
if (!(rendered.streams ?? []).some((s) => s.codec_type === "audio")) throw new Error("Rendered video lost its audio track");

const customId = `bb1-nine-teeth-${new Date().toISOString().slice(0,10).replaceAll("-", "")}`;
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

const blob = await put(`videos/${path.basename(output)}`, fs.readFileSync(output), {
  access: "public",
  addRandomSuffix: true,
  multipart: true,
  contentType: "video/mp4",
  token: process.env.BLOB_READ_WRITE_TOKEN,
});

console.log(`Hosted MP4: ${blob.url}`);
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
  { text: caption, channelId, videoUrl: blob.url },
);

if (data?.createPost?.message) throw new Error(`Buffer publish failed: ${data.createPost.message}`);
const post = data?.createPost?.post;
if (!post?.id) throw new Error("Buffer publish returned no post ID");

console.log(`BUFFER_POST_CREATED: ${post.id}`);
console.log(`BUFFER_STATUS: ${post.status}`);
console.log(`CHANNEL_ID: ${post.channelId}`);
console.log("Original NotebookLM audio preserved: yes");
