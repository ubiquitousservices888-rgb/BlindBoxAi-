import {
  DISCLOSURE,
  createBufferPublisher,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";

const BLINDBOXAI_URL = "https://www.blindboxai.com";

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function validateVideoUrl(value) {
  const text = required(value, "REVIEWED_VIDEO_URL");
  let url;
  try { url = new URL(text); } catch { throw new Error("REVIEWED_VIDEO_URL must be a valid URL"); }
  if (url.protocol !== "https:" || !/\.mp4$/i.test(url.pathname)) {
    throw new Error("REVIEWED_VIDEO_URL must be an HTTPS MP4");
  }
  return url.toString();
}

const videoUrl = validateVideoUrl(process.env.REVIEWED_VIDEO_URL);
const title = required(process.env.REVIEWED_VIDEO_TITLE, "REVIEWED_VIDEO_TITLE").slice(0, 120);
if (/https?:\/\//i.test(title)) throw new Error("Reviewed video title must not contain URLs");

const channels = [...new Set(String(process.env.VIDEO_CHANNELS ?? "youtube,tiktok")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean))];
if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one service");

const publisher = createBufferPublisher({
  token: process.env.BUFFER_API_TOKEN,
  organizationId: process.env.BUFFER_ORGANIZATION_ID,
});

const script = {
  title,
  facts: ["Owner-reviewed BlindBoxAI video."],
  productUrl: BLINDBOXAI_URL,
};

const results = [];
for (const channel of channels) {
  const caption = videoCaptionForService(script, channel);
  if (!caption.includes(BLINDBOXAI_URL) || !caption.includes(DISCLOSURE)) {
    throw new Error(`${channel}: CTA and affiliate disclosure are required`);
  }
  const result = await publisher({ channel, videoUrl, caption });
  results.push({ channel, id: result.id, duplicate: result.duplicate === true });
  console.log(`REVIEWED_UPLOAD_PUBLISHED: ${channel}:${result.id}`);
}

console.log(`REVIEWED_UPLOAD_CHANNELS: ${results.length}`);
