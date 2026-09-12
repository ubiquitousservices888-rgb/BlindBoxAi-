import {
  DISCLOSURE,
  createBufferPublisher,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";

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

const researchRunId = required(process.env.RESEARCH_RUN_ID, "RESEARCH_RUN_ID");
if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) throw new Error("RESEARCH_RUN_ID is invalid");

const channels = [...new Set(String(process.env.VIDEO_CHANNELS ?? "youtube,tiktok")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean))];
if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one service");

const publisher = createBufferPublisher({
  token: process.env.BUFFER_API_TOKEN,
  organizationId: process.env.BUFFER_ORGANIZATION_ID,
});

const results = [];
for (const channel of channels) {
  const trackedCta = buildTrackedSocialCta(BLINDBOXAI_URL, {
    runId: researchRunId,
    service: channel,
  });
  const script = {
    title,
    facts: ["Owner-reviewed BlindBoxAI video."],
    productUrl: trackedCta,
  };
  const caption = videoCaptionForService(script, channel);
  if (!caption.includes(trackedCta) || !caption.includes(DISCLOSURE)) {
    throw new Error(`${channel}: tracked CTA and affiliate disclosure are required`);
  }
  const result = await publisher({ channel, videoUrl, caption });
  const tracked = new URL(trackedCta);
  results.push({
    channel,
    id: result.id,
    duplicate: result.duplicate === true,
    campaignId: tracked.searchParams.get("campaign"),
    source: tracked.searchParams.get("source"),
  });
  console.log(`REVIEWED_UPLOAD_PUBLISHED: ${channel}:${result.id}`);
}

console.log(`REVIEWED_UPLOAD_RESEARCH_RUN: ${researchRunId}`);
console.log(`REVIEWED_UPLOAD_CHANNELS: ${results.length}`);
