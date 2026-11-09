import fs from "node:fs";

import {
  REVIEW_PUBLIC_PLAYER_CHANNELS,
  REVIEW_RECEIPT_PROOF_CHANNELS,
  createReviewBufferPublisher,
  isVerifiedPublicPostUrl,
  resolveReviewBufferChannel,
} from "../lib/buffer-review-publisher.mjs";
import { buildReviewCaption, reviewPublicTitle } from "../lib/review-caption.mjs";
import { isPublicVideoTitle } from "../lib/public-video-title.mjs";
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
if (configuredChannels.some((channel) => !REVIEW_PUBLIC_PLAYER_CHANNELS.includes(channel))) {
  throw new Error("Public video metadata proof only supports YouTube and TikTok; unsupported channel refused before queue claim");
}
// Add-on destinations (LinkedIn) are posted only by an exact dispatch, after
// the video is already live on a primary channel. They never decide whether a
// row counts as fully published.
const addOnChannels = [...new Set(String(process.env.ADDON_VIDEO_CHANNELS ?? "")
  .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))];
if (addOnChannels.some((channel) => !REVIEW_RECEIPT_PROOF_CHANNELS.includes(channel) || configuredChannels.includes(channel))) {
  throw new Error("ADDON_VIDEO_CHANNELS only supports LinkedIn; unsupported add-on channel refused before queue claim");
}
const publishAllChannels = requestedChannel === "all";
const requestedAddOn = addOnChannels.includes(requestedChannel);
if (requestedChannel && !publishAllChannels && !requestedAddOn && !configuredChannels.includes(requestedChannel)) {
  throw new Error(`Requested channel is not in VIDEO_CHANNELS or ADDON_VIDEO_CHANNELS: ${requestedChannel}`);
}
if ((!requestedChannel || requestedChannel === "youtube" || publishAllChannels) && configuredChannels.includes("youtube") &&
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
  channel: publishAllChannels ? undefined : requestedChannel || undefined,
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
  const titleNeedsRepair = !isPublicVideoTitle(item.title);
  const publicTitle = reviewPublicTitle(item);
  const safeVideoUrl = assertApprovedReviewVideoUrl(item.video_url);
  if (!dryRun) required(leaseToken, "queue lease token");
  if (titleNeedsRepair) {
    if (dryRun) {
      console.log(`REVIEW_QUEUE_WOULD_REPAIR_TITLE: ${publicTitle}`);
    } else {
      try {
        await postJson(REVIEW_QUEUE_URL, reviewToken, {
          action: "repair_title",
          researchRunId: item.research_run_id,
          leaseToken,
          title: publicTitle,
        });
      } catch (cause) {
        const error = new Error(`Title repair could not be persisted: ${cause instanceof Error ? cause.message : String(cause)}`);
        error.code = "TITLE_REPAIR_PENDING";
        throw error;
      }
      console.log(`REVIEW_QUEUE_TITLE_REPAIRED: ${item.research_run_id}`);
    }
  }

  const targetChannels = configuredChannels;
  const eligibleChannels = publishAllChannels
    ? targetChannels
    : requestedChannel
      ? [requestedChannel]
      : targetChannels;
  const recordedPublicUrls = item.public_urls && typeof item.public_urls === "object" ? item.public_urls : {};
  const completedChannels = new Set(
    (Array.isArray(item.published_channels) ? item.published_channels : [])
      .filter((channel) => isVerifiedPublicPostUrl(channel, recordedPublicUrls[channel])),
  );
  if (requestedAddOn && !targetChannels.some((channel) => completedChannels.has(channel))) {
    throw new Error(`${requestedChannel}: add-on post refused until this video is verified live on ${targetChannels.join(" or ")}`);
  }
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
  let rowComplete = false;
  for (const channel of channels) {
    const { campaignId, source, caption } = buildReviewCaption(item, channel, publicTitle);
    const result = await publisher({
      channel,
      videoUrl: safeVideoUrl,
      caption,
      title: publicTitle,
      youtubeCategoryId: "17",
      youtubeMadeForKids: channel === "youtube" ? youtubeAudience === "made_for_kids" : undefined,
      acceptedPostId: item.buffer_post_ids?.[channel],
      onAccepted: async ({ postId }) => {
        console.log(`REVIEW_QUEUE_BUFFER_POST_ACCEPTED: ${channel}:${postId}`);
        await postJson(REVIEW_QUEUE_URL, reviewToken, {
          action: "record_submission",
          researchRunId: item.research_run_id,
          leaseToken,
          channel,
          externalId: postId,
        });
      },
    });
    if (!result.publicUrl || !isVerifiedPublicPostUrl(channel, result.publicUrl)) {
      throw new Error(`${channel}: platform public URL is missing or invalid`);
    }
    if (REVIEW_RECEIPT_PROOF_CHANNELS.includes(channel)) {
      if (result.proofKind !== "buffer_receipt" || result.status !== "sent" || !Number.isFinite(Date.parse(result.receiptCheckedAt))) {
        throw new Error(`${channel}: Buffer sent receipt for the exact caption and video is missing`);
      }
      console.log(`REVIEW_QUEUE_BUFFER_RECEIPT_PROOF: ${channel}:sent:${result.receiptCheckedAt}`);
    } else {
      if (result.proofKind !== "public_player" || result.publicHttpStatus !== 200 || result.publicMediaAvailable !== true ||
          !Number.isFinite(Date.parse(result.publicHttpCheckedAt))) {
        throw new Error(`${channel}: platform public URL lacks an independent HTTP 200 receipt`);
      }
      console.log(`REVIEW_QUEUE_PUBLIC_HTTP_PROOF: ${channel}:200:${result.publicHttpCheckedAt}`);
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
    rowComplete = recorded?.complete === true;
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
    }
  }

  // The homepage feed accepts only rows the queue has marked published. A
  // partial row keeps its verified channels and waits for the next channel.
  if (!rowComplete) {
    console.log(`REVIEW_QUEUE_FEED_DEFERRED: ${item.research_run_id}`);
    process.exit(0);
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
  if (["PUBLIC_VERIFICATION_PENDING", "TITLE_REPAIR_PENDING"].includes(error?.code)) {
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
