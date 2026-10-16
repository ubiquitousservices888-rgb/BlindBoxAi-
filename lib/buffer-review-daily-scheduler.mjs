import { createHash } from "node:crypto";
import { bufferGraphQL } from "./daily-product-pipeline.mjs";
import { DISCLOSURE } from "./video-pipeline.mjs";
import { findExistingBufferPostPaginated } from "./daily-product-publish-safety.mjs";
import { resolveReviewBufferChannel } from "./buffer-review-publisher.mjs";
import { assertApprovedReviewVideoUrl } from "./review-publish-safety.mjs";
import { assertPublicMp4 } from "./buffer-media-safety.mjs";
import { probeYoutubeShortsMedia } from "./review-shorts-preflight.mjs";

// Only call after the canonical owner-approved review and explicit per-video
// YouTube audience decision. This module does not approve or select videos.
// Buffer acceptance is a scheduled receipt, NEVER proof of a live post.
export function validReviewedSchedule(dueAt, now = new Date()) {
  const match = typeof dueAt === "string" && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(dueAt);
  if (!match) throw new Error("A UTC ISO-8601 scheduled time is required");
  const timestamp = Date.parse(dueAt), start = new Date(now).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(start)) {
    throw new Error("Invalid UTC scheduled time");
  }
  const date = new Date(timestamp);
  // Date.parse can roll February 31 into March, even with valid-looking ISO syntax.
  if (date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() + 1 !== Number(match[2]) ||
      date.getUTCDate() !== Number(match[3]) ||
      date.getUTCHours() !== Number(match[4]) ||
      date.getUTCMinutes() !== Number(match[5]) ||
      date.getUTCSeconds() !== Number(match[6]) ||
      timestamp < start + 5 * 60_000 || timestamp > start + 10 * 86400_000) {
    throw new Error("Scheduled time must be a valid UTC date 5 minutes to 10 days in the future");
  }
  return date.toISOString();
}

// Only one first-party CTA is allowed. Substring checks are unsafe:
// evilblindboxai.com can otherwise satisfy a blindboxai.com include().
export function assertReviewedCaptionCta(caption, researchRunId, channel) {
  const copy = String(caption ?? "");
  const urls = copy.match(/https?:\/\/[^\s<>"'\x60]+/gi) ?? [];
  if (!copy.includes(DISCLOSURE) || urls.length !== 1) {
    throw new Error("Reviewed caption must contain one verified CTA and affiliate disclosure");
  }
  let url;
  try { url = new URL(urls[0]); } catch {
    throw new Error("Reviewed caption CTA must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["blindboxai.com", "www.blindboxai.com"].includes(url.hostname) ||
      url.searchParams.getAll("campaign").length !== 1 ||
      url.searchParams.get("campaign") !== "bb-" + researchRunId ||
      url.searchParams.getAll("source").length !== 1 ||
      url.searchParams.get("source") !== channel) {
    throw new Error("Reviewed caption must contain exact first-party campaign/source attribution");
  }
  return copy;
}

export async function scheduleOwnerReviewedVideo({
  token, organizationId, channel, researchRunId, videoUrl, caption, title,
  youtubeMadeForKids, dueAt, now = new Date(), fetchImpl = fetch,
  resolveChannelImpl = resolveReviewBufferChannel,
  findExistingImpl = findExistingBufferPostPaginated,
  verifyMediaImpl = assertPublicMp4,
  probeYoutubeImpl = probeYoutubeShortsMedia,
  // Must be a durable, distributed compare-and-insert claim keyed by run/channel.
  // Never substitute a process-local Set in production.
  claimScheduleImpl,
}) {
  if (!token || !organizationId) throw new Error("Buffer configuration is required");
  if (!["youtube", "tiktok"].includes(channel)) throw new Error("Unsupported video channel");
  if (!/^rv-[a-f0-9]{16}$/.test(String(researchRunId || ""))) throw new Error("Invalid approved research run ID");
  if (channel === "youtube" && typeof youtubeMadeForKids !== "boolean") {
    throw new Error("YouTube requires the owner's explicit per-video audience decision");
  }
  const timestamp = validReviewedSchedule(dueAt, now);
  const safeVideoUrl = assertApprovedReviewVideoUrl(videoUrl);
  const canonicalId = "rv-" + createHash("sha256").update(safeVideoUrl).digest("hex").slice(0,16);
  if (canonicalId !== researchRunId) throw new Error("Approved research ID and exact video URL do not match");
  const copy = assertReviewedCaptionCta(caption, researchRunId, channel);
  if (!title || typeof title !== "string" || !title.trim()) throw new Error("Approved title required");
  await verifyMediaImpl(safeVideoUrl, fetchImpl);
  if (channel === "youtube") await probeYoutubeImpl(safeVideoUrl);
  const target = await resolveChannelImpl({token, organizationId, channel, fetchImpl});
  if (!target?.id || target.service !== channel || target.isQueuePaused || target.isDisconnected || target.isLocked) {
    throw new Error("Automatic Buffer scheduled destination is not available");
  }
  // Fail closed until an owner-approved, persistent atomic claim backend exists.
  // Keep claims held on uncertain Buffer outcomes; retry must reconcile first.
  if (typeof claimScheduleImpl !== "function") {
    throw new Error("Atomic schedule claim provider is required before Buffer writes");
  }
  const claim = await claimScheduleImpl({
    researchRunId, channel, channelId:target.id, videoUrl:safeVideoUrl,
  });
  if (claim?.claimed !== true) {
    throw new Error("Atomic schedule claim not acquired; reconcile before retry");
  }
  const existing = await findExistingImpl({
    token, organizationId, channelId: target.id, text: copy, fetchImpl, now,
  });
  if (existing?.id) {
    // No duplicate or upgrade to published. A later verifier must inspect
    // Buffer's sent receipt and the actual public platform URL.
    return {id:existing.id, channel, duplicate:true, status:existing.status || "unknown", dueAt:null, publicUrl:null};
  }
  const input = {
    text:copy, channelId:target.id, schedulingType:"automatic",
    mode:"customScheduled", dueAt:timestamp,
    assets:[{video:{url:safeVideoUrl}}],
    ...(channel === "youtube" ? {metadata:{youtube:{
      title:title.trim().slice(0,100), categoryId:"17", madeForKids:youtubeMadeForKids,
    }}} : {}),
  };
  const data = await bufferGraphQL(token,
    `mutation ScheduleReviewedVideo($input: CreatePostInput!) {
      createPost(input: $input) {
        __typename
        ... on PostActionSuccess { post { id status dueAt channelId text } }
        ... on MutationError { message }
      }
    }`,
    {input},fetchImpl,
  );
  const result = data?.createPost;
  if (result?.message) throw new Error("Buffer rejected the scheduled video");
  if (!result?.post?.id || result.post.channelId !== target.id ||
      !["scheduled","buffer"].includes(result.post.status) ||
      String(result.post.text ?? "") !== copy ||
      !result.post.dueAt || Date.parse(result.post.dueAt) !== Date.parse(timestamp)) {
    throw new Error("Buffer did not return an exact scheduled receipt; reconcile before retry");
  }
  return {id:result.post.id, channel, duplicate:false, status:"scheduled", dueAt:timestamp, publicUrl:null};
}
