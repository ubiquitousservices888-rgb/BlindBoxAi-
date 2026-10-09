import fs from "node:fs";

import {
  DISCLOSURE,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";
import {
  createReviewBufferPublisher,
  isVerifiedPublicPostUrl,
  resolveReviewBufferChannel,
} from "../lib/buffer-review-publisher.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";
import { reviewVideoLandingUrl } from "../lib/review-landing-url.mjs";
import { requirePublicVideoTitle } from "../lib/public-video-title.mjs";
import { assertPublicMp4 } from "../lib/buffer-media-safety.mjs";
import { probeYoutubeShortsMedia } from "../lib/review-shorts-preflight.mjs";
import { normalizeReviewRunId } from "../lib/review-run-id.mjs";
import {
  assertApprovedReviewVideoUrl,
  cappedPublishChannels,
  isDryRun,
  MAX_BUFFER_POSTS_PER_EXECUTION,
} from "../lib/review-publish-safety.mjs";

const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";
const PUBLISHED_FEED_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/published-video-feed";
const REVIEW_OIDC_AUDIENCE = "blindboxai-review-publisher";
const FEED_OIDC_AUDIENCE = "blindboxai-video-publisher";
const RECEIPT_PATH = "output/video-pipeline/state.json";

function updatePublicationReceipt({ state, channels, bufferPostIds, publicUrls }) {
  if (!fs.existsSync(RECEIPT_PATH)) return;
  const receipt = JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8"));
  const publications = receipt.publications && typeof receipt.publications === "object"
    ? { ...receipt.publications }
    : {};
  for (const channel of channels) {
    publications[channel] = {
      ...(publications[channel] || {}),
      status: "published",
      externalId: bufferPostIds[channel] || publications[channel]?.externalId || null,
      publicUrl: publicUrls[channel] || publications[channel]?.publicUrl || null,
      error: null,
    };
  }
  const now = new Date().toISOString();
  receipt.state = state;
  receipt.publications = publications;
  receipt.review = {
    ...(receipt.review || {}),
    publicationState: state,
    publishedChannels: channels,
  };
  if (state === "PUBLISHED") receipt.publishedAt = now;
  receipt.updatedAt = now;
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + "\n");
}

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
const requestedChannel = String(process.env.PUBLISH_CHANNEL ?? "").trim().toLowerCase();
const requestedRunId = normalizeReviewRunId(process.env.PUBLISH_RESEARCH_RUN_ID);
const youtubeAudience = String(process.env.YOUTUBE_AUDIENCE ?? "unreviewed");
const configuredChannels = [...new Set(String(process.env.VIDEO_CHANNELS ?? "youtube,tiktok")
  .split(",").map((value) => value.trim()).filter(Boolean))];
if (!configuredChannels.length) {
  throw new Error("VIDEO_CHANNELS must contain at least one service");
}
if (requestedChannel && !configuredChannels.includes(requestedChannel)) {
  throw new Error(`Requested channel is not in VIDEO_CHANNELS: ${requestedChannel}`);
}
if ((!requestedChannel || requestedChannel === "youtube") && configuredChannels.includes("youtube") &&
    !["made_for_kids", "not_made_for_kids"].includes(youtubeAudience)) {
  throw new Error("Owner must select the YouTube Made-for-Kids audience decision for this exact video");
}
if (!dryRun && !requestedRunId) {
  throw new Error("Live publication requires an exact research_run_id in the manual dispatch");
}
if (!dryRun && !requestedChannel) {
  throw new Error("Live publication requires one exact publish_channel in the manual dispatch");
}
const reviewToken = await getGithubOidcToken(REVIEW_OIDC_AUDIENCE);
const queueResult = await postJson(REVIEW_QUEUE_URL, reviewToken, {
  action: dryRun ? "peek" : "claim",
  channel: requestedChannel || undefined,
  researchRunId: requestedRunId || undefined,
});
const item = queueResult?.item;
if (dryRun) {
  console.log("REVIEW_QUEUE_DRY_RUN: true");
  console.log("REVIEW_QUEUE_DRY_RUN_SIDE_EFFECTS: 0");
  console.log(`REVIEW_QUEUE_MAX_BUFFER_POSTS: ${MAX_BUFFER_POSTS_PER_EXECUTION}`);
  if (requestedRunId) console.log(`REVIEW_QUEUE_REQUESTED_RUN: ${requestedRunId}`);
}
if (!item) {
  console.log("REVIEW_QUEUE_EMPTY: true");
  process.exit(0);
}
const leaseToken = dryRun ? "" : String(item.publishing_at ?? "").trim();
try {
  const publicTitle = requirePublicVideoTitle(item.title, { label: "review queue title", maxLength: 100 });
  const safeVideoUrl = assertApprovedReviewVideoUrl(item.video_url);
  if (!dryRun) required(leaseToken, "queue lease token");

  const targetChannels = configuredChannels;
  const eligibleChannels = requestedChannel ? [requestedChannel] : targetChannels;
  const recordedPublicUrls = item.public_urls && typeof item.public_urls === "object" ? item.public_urls : {};
  const completedChannels = new Set(
    (Array.isArray(item.published_channels) ? item.published_channels : [])
      .filter((channel) => isVerifiedPublicPostUrl(channel, recordedPublicUrls[channel])),
  );
  const remainingChannels = eligibleChannels.filter((channel) => !completedChannels.has(channel));
  if (!remainingChannels.length) {
    if (!dryRun) {
      await postJson(REVIEW_QUEUE_URL, reviewToken, {
        action: "release",
        researchRunId: item.research_run_id,
        leaseToken,
        error: "No remaining configured publish channels",
      });
    }
    console.log("REVIEW_QUEUE_NO_REMAINING_CHANNELS: true");
    process.exit(0);
  }
  const { selected: channels, deferred: deferredChannels } = cappedPublishChannels(remainingChannels.join(","));
  await assertPublicMp4(safeVideoUrl);
  if (channels[0] === "youtube") {
    const media = await probeYoutubeShortsMedia(safeVideoUrl);
    console.log(`REVIEW_QUEUE_SHORTS_MEDIA: ${media.width}x${media.height}, ${media.durationSeconds.toFixed(2)}s`);
    console.log(`REVIEW_QUEUE_YOUTUBE_AUDIENCE: ${youtubeAudience}`);
  }
  const target = await resolveReviewBufferChannel({
    token: process.env.BUFFER_API_TOKEN,
    organizationId: process.env.BUFFER_ORGANIZATION_ID,
    channel: channels[0],
  });
  console.log(`REVIEW_QUEUE_BUFFER_DESTINATION: ${target.service}:${target.serviceId}`);
  if (deferredChannels.length) {
    console.log(`REVIEW_QUEUE_CHANNELS_DEFERRED: ${deferredChannels.join(",")}`);
  }
  console.log(`REVIEW_QUEUE_MAX_BUFFER_POSTS: ${MAX_BUFFER_POSTS_PER_EXECUTION}`);
  if (dryRun) {
    console.log(`REVIEW_QUEUE_WOULD_PUBLISH_RUN: ${item.research_run_id}`);
    console.log(`REVIEW_QUEUE_WOULD_PUBLISH_TITLE: ${publicTitle}`);
    console.log(`REVIEW_QUEUE_WOULD_PUBLISH_CHANNEL: ${channels[0]}`);
    process.exit(0);
  }

  const publisher = createReviewBufferPublisher({
    token: process.env.BUFFER_API_TOKEN,
    organizationId: process.env.BUFFER_ORGANIZATION_ID,
  });

  const results = [];
  for (const channel of channels) {
    const trackedCta = buildTrackedSocialCta(reviewVideoLandingUrl(item), {
      runId: item.research_run_id,
      service: channel,
    });
    const trackedUrl = new URL(trackedCta);
    const campaignId = trackedUrl.searchParams.get("campaign");
    const source = trackedUrl.searchParams.get("source");
    if (!campaignId || !source) {
      throw new Error(`${channel}: tracked CTA is missing campaign or source`);
    }
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
      youtubeMadeForKids: channel === "youtube" ? youtubeAudience === "made_for_kids" : undefined,
    });
    if (!result.publicUrl || !isVerifiedPublicPostUrl(channel, result.publicUrl)) {
      throw new Error(`${channel}: publisher returned no verified public URL`);
    }
    results.push({
      channel,
      id: result.id,
      publicUrl: result.publicUrl,
      duplicate: result.duplicate === true,
      campaignId,
      source,
    });
    console.log(`REVIEW_QUEUE_PUBLISHED: ${channel}:${result.id}`);
    console.log(`REVIEW_QUEUE_PUBLIC_URL: ${channel}:${result.publicUrl}`);
    const recorded = await postJson(REVIEW_QUEUE_URL, reviewToken, {
      action: "record_channel",
      researchRunId: item.research_run_id,
      leaseToken,
      channel,
      externalId: result.id,
      publicUrl: result.publicUrl,
      targetChannels,
    });
    console.log(`REVIEW_QUEUE_CHANNEL_RECORDED: ${channel}`);
    if (!recorded?.complete) {
      const partialChannels = Array.isArray(recorded?.item?.published_channels)
        ? recorded.item.published_channels
        : [channel];
      updatePublicationReceipt({
        state: "PARTIALLY_PUBLISHED",
        channels: partialChannels,
        bufferPostIds: recorded?.item?.buffer_post_ids || { [channel]: result.id },
        publicUrls: recorded?.item?.public_urls || { [channel]: result.publicUrl },
      });
      console.log(`REVIEW_QUEUE_CHANNELS_PENDING: ${targetChannels.filter((value) => !partialChannels.includes(value)).join(",")}`);
      process.exit(0);
    }
  }

  const feedToken = await getGithubOidcToken(FEED_OIDC_AUDIENCE);
  const mergedBufferPostIds = {
    ...(item.buffer_post_ids || {}),
    ...Object.fromEntries(results.map((entry) => [entry.channel, entry.id])),
  };
  const mergedPublicUrls = {
    ...(item.public_urls || {}),
    ...Object.fromEntries(results.map((entry) => [entry.channel, entry.publicUrl])),
  };
  const feedChannels = [...new Set([
    ...(Array.isArray(item.published_channels) ? item.published_channels : []),
    ...results.map((entry) => entry.channel),
  ])].filter((channel) => isVerifiedPublicPostUrl(channel, mergedPublicUrls[channel]));
  const campaignIds = [...new Set(
    results.map((entry) => entry.campaignId).filter(Boolean),
  )];
  if (campaignIds.length !== 1) {
    throw new Error("Published feed requires exactly one campaign ID for this execution");
  }
  await postJson(PUBLISHED_FEED_URL, feedToken, {
    researchRunId: item.research_run_id,
    title: publicTitle,
    vertical: item.vertical,
    videoUrl: safeVideoUrl,
    channels: feedChannels,
    bufferPostIds: mergedBufferPostIds,
    publicUrls: mergedPublicUrls,
    campaignId: campaignIds[0],
  });
  updatePublicationReceipt({
    state: "PUBLISHED",
    channels: feedChannels,
    bufferPostIds: mergedBufferPostIds,
    publicUrls: mergedPublicUrls,
  });

  console.log(`REVIEW_QUEUE_COMPLETE: ${item.research_run_id}`);
  console.log(`REVIEW_QUEUE_HOMEPAGE_LINKED: ${item.research_run_id}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (dryRun || !leaseToken) throw error;
  if (error?.code === "PUBLIC_VERIFICATION_PENDING") {
    await postJson(REVIEW_QUEUE_URL, reviewToken, {
      action: "release",
      researchRunId: item.research_run_id,
      leaseToken,
      error: message,
    }).catch(() => {});
  } else {
    await postJson(REVIEW_QUEUE_URL, reviewToken, {
      action: "complete",
      researchRunId: item.research_run_id,
      leaseToken,
      success: false,
      error: message,
    }).catch(() => {});
  }
  throw error;
}
