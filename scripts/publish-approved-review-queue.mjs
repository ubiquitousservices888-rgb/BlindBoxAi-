import {
  DISCLOSURE,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";
import { createReviewBufferPublisher } from "../lib/buffer-review-publisher.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";
import { requirePublicVideoTitle } from "../lib/public-video-title.mjs";
import {
  assertApprovedReviewVideoUrl,
  cappedPublishChannels,
  isDryRun,
  MAX_BUFFER_POSTS_PER_EXECUTION,
} from "../lib/review-publish-safety.mjs";

const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";
const PUBLISHED_FEED_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/published-video-feed";
const BLINDBOXAI_URL = "https://www.blindboxai.com";
const REVIEW_OIDC_AUDIENCE = "blindboxai-review-publisher";
const FEED_OIDC_AUDIENCE = "blindboxai-video-publisher";

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

async function getGithubOidcToken(audience, fetchImpl = fetch) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error("GitHub OIDC environment is unavailable");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", audience);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!response.ok) throw new Error(`GitHub OIDC request failed: ${response.status}`);
  const body = await response.json();
  return required(body?.value, "GitHub OIDC token");
}

async function postJson(url, token, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
  return data;
}

const dryRun = isDryRun(process.env.DRY_RUN);
if (dryRun) {
  console.log("REVIEW_QUEUE_DRY_RUN: true");
  console.log("REVIEW_QUEUE_DRY_RUN_SIDE_EFFECTS: 0");
  console.log(`REVIEW_QUEUE_MAX_BUFFER_POSTS: ${MAX_BUFFER_POSTS_PER_EXECUTION}`);
  process.exit(0);
}

const reviewToken = await getGithubOidcToken(REVIEW_OIDC_AUDIENCE);
const claimed = await postJson(REVIEW_QUEUE_URL, reviewToken, { action: "claim" });
const item = claimed?.item;
if (!item) {
  console.log("REVIEW_QUEUE_EMPTY: true");
  process.exit(0);
}
const publicTitle = requirePublicVideoTitle(item.title, { label: "review queue title", maxLength: 100 });
const safeVideoUrl = assertApprovedReviewVideoUrl(item.video_url);

const targetChannels = [...new Set(String(process.env.VIDEO_CHANNELS ?? "youtube,tiktok")
  .split(",").map((value) => value.trim()).filter(Boolean))];
const completedChannels = new Set(Array.isArray(item.published_channels) ? item.published_channels : []);
const remainingChannels = targetChannels.filter((channel) => !completedChannels.has(channel));
if (!remainingChannels.length) throw new Error("Review queue item has no remaining publish channels");
const { selected: channels, deferred: deferredChannels } = cappedPublishChannels(remainingChannels.join(","));
if (deferredChannels.length) {
  console.log(`REVIEW_QUEUE_CHANNELS_DEFERRED: ${deferredChannels.join(",")}`);
}
console.log(`REVIEW_QUEUE_MAX_BUFFER_POSTS: ${MAX_BUFFER_POSTS_PER_EXECUTION}`);

const publisher = createReviewBufferPublisher({
  token: process.env.BUFFER_API_TOKEN,
  organizationId: process.env.BUFFER_ORGANIZATION_ID,
});

const results = [];
try {
  for (const channel of channels) {
    const trackedCta = buildTrackedSocialCta(BLINDBOXAI_URL, {
      runId: item.research_run_id,
      service: channel,
    });
    const script = {
      title: publicTitle,
      facts: [item.vertical === "pokemon_tcg" ? "Pokémon collectible research." : "Owner-reviewed BlindBoxAI collectible research."],
      productUrl: trackedCta,
    };
    const caption = videoCaptionForService(script, channel);
    if (!caption.includes(trackedCta) || !caption.includes(DISCLOSURE)) {
      throw new Error(`${channel}: tracked CTA and affiliate disclosure are required`);
    }
    const result = await publisher({
      channel,
      videoUrl: safeVideoUrl,
      caption,
      title: publicTitle,
      youtubeCategoryId: "17",
    });
    results.push({ channel, id: result.id, duplicate: result.duplicate === true, campaignId: new URL(trackedCta).searchParams.get("campaign") });
    console.log(`REVIEW_QUEUE_PUBLISHED: ${channel}:${result.id}`);
    const recorded = await postJson(REVIEW_QUEUE_URL, reviewToken, {
      action: "record_channel",
      researchRunId: item.research_run_id,
      channel,
      externalId: result.id,
      targetChannels,
    });
    console.log(`REVIEW_QUEUE_CHANNEL_RECORDED: ${channel}`);
    if (!recorded?.complete) {
      console.log(`REVIEW_QUEUE_CHANNELS_PENDING: ${targetChannels.filter((value) => !(recorded?.item?.published_channels || []).includes(value)).join(",")}`);
      process.exit(0);
    }
  }

  const feedToken = await getGithubOidcToken(FEED_OIDC_AUDIENCE);
  await postJson(PUBLISHED_FEED_URL, feedToken, {
    researchRunId: item.research_run_id,
    title: publicTitle,
    vertical: item.vertical,
    videoUrl: safeVideoUrl,
    channels: targetChannels,
    bufferPostIds: { ...(item.buffer_post_ids || {}), ...Object.fromEntries(results.map((entry) => [entry.channel, entry.id])) },
    campaignId: results[0]?.campaignId || null,
  });

  console.log(`REVIEW_QUEUE_COMPLETE: ${item.research_run_id}`);
  console.log(`REVIEW_QUEUE_HOMEPAGE_LINKED: ${item.research_run_id}`);
} catch (error) {
  await postJson(REVIEW_QUEUE_URL, reviewToken, { action: "complete", researchRunId: item.research_run_id, success: false, error: error instanceof Error ? error.message : String(error) }).catch(() => {});
  throw error;
}
