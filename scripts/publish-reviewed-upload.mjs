import {
  DISCLOSURE,
  createBufferPublisher,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";

const BLINDBOXAI_URL = "https://www.blindboxai.com";
const OIDC_AUDIENCE = "blindboxai-video-publisher";
const DEFAULT_FEED_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/published-video-feed";

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
  if (!url.hostname.endsWith(".public.blob.vercel-storage.com") || !url.pathname.startsWith("/media/review/")) {
    throw new Error("REVIEWED_VIDEO_URL must use the approved Vercel Blob review-media namespace");
  }
  return url.toString();
}

function inferVertical(value) {
  const title = String(value ?? "");
  if (/\b(?:pokemon|pokémon|charizard|mewtwo|umbreon|espeon|pikachu)\b/i.test(title)) return "pokemon_tcg";
  if (/\b(?:topps|bowman|panini|prizm|baseball|basketball|football|hockey|rookie|relic|autograph|auto)\b/i.test(title)) return "sports_cards";
  if (/\b(?:magic|black lotus|mtg)\b/i.test(title)) return "magic_the_gathering";
  if (/\b(?:labubu|pop mart|skullpanda|hirono|dimoo)\b/i.test(title)) return "pop_mart";
  return "other_collectible";
}

async function getGithubOidcToken(fetchImpl = fetch) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error("GitHub OIDC environment is unavailable");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", OIDC_AUDIENCE);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload?.value) throw new Error("GitHub OIDC token response was empty");
  return payload.value;
}

async function recordPublishedVideo({ title, videoUrl, researchRunId, results, fetchImpl = fetch }) {
  const oidcToken = await getGithubOidcToken(fetchImpl);
  const feedUrl = required(process.env.PUBLISHED_VIDEO_FEED_URL || DEFAULT_FEED_URL, "PUBLISHED_VIDEO_FEED_URL");
  const bufferPostIds = Object.fromEntries(results.map((item) => [item.channel, item.id]));
  const campaignId = results.find((item) => item.campaignId)?.campaignId || null;
  const response = await fetchImpl(feedUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${oidcToken}`,
      "content-type": "application/json",
      "user-agent": "BlindBoxAI-ReviewedVideoPublisher/1.0",
    },
    body: JSON.stringify({
      researchRunId,
      title,
      vertical: inferVertical(title),
      videoUrl,
      channels: results.map((item) => item.channel),
      bufferPostIds,
      campaignId,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`Published video feed recording failed: ${response.status} ${payload?.error || ""}`.trim());
  }
  return payload;
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

const dryRun = /^(?:1|true|yes)$/i.test(String(process.env.DRY_RUN ?? ""));
if (dryRun) console.log("REVIEWED_UPLOAD_DRY_RUN: true");

const publisher = dryRun ? null : createBufferPublisher({
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
  const result = dryRun
    ? { id: `dry-run-${channel}`, duplicate: false }
    : await publisher({ channel, videoUrl, caption });
  const tracked = new URL(trackedCta);
  results.push({
    channel,
    id: result.id,
    duplicate: result.duplicate === true,
    campaignId: tracked.searchParams.get("campaign"),
    source: tracked.searchParams.get("source"),
  });
  console.log(dryRun\n    ? `REVIEWED_UPLOAD_DRY_RUN_CHANNEL: ${channel}:${result.id}`\n    : `REVIEWED_UPLOAD_PUBLISHED: ${channel}:${result.id}`);
}

if (!dryRun) {
  await recordPublishedVideo({ title, videoUrl, researchRunId, results });
  console.log(`REVIEWED_UPLOAD_HOMEPAGE_LINKED: ${researchRunId}`);
} else {
  console.log(`REVIEWED_UPLOAD_DRY_RUN_COMPLETE: ${researchRunId}`);
}
console.log(`REVIEWED_UPLOAD_RESEARCH_RUN: ${researchRunId}`);
console.log(`REVIEWED_UPLOAD_CHANNELS: ${results.length}`);

export { inferVertical, recordPublishedVideo };
