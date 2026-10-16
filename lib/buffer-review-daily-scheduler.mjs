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
  if (typeof dueAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(dueAt)) {
    throw new Error("A UTC ISO-8601 scheduled time is required");
  }
  const timestamp = Date.parse(dueAt), start = new Date(now).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(start) ||
      timestamp < start + 5 * 60_000 || timestamp > start + 10 * 86400_000) {
    throw new Error("Scheduled time must be 5 minutes to 10 days in the future");
  }
  return new Date(timestamp).toISOString();
}

export async function scheduleOwnerReviewedVideo({
  token, organizationId, channel, researchRunId, videoUrl, caption, title,
  youtubeMadeForKids, dueAt, now = new Date(), fetchImpl = fetch,
  resolveChannelImpl = resolveReviewBufferChannel,
  findExistingImpl = findExistingBufferPostPaginated,
  verifyMediaImpl = assertPublicMp4,
  probeYoutubeImpl = probeYoutubeShortsMedia,
}) {
  if (!token || !organizationId) throw new Error("Buffer configuration is required");
  if (!["youtube", "tiktok"].includes(channel)) throw new Error("Unsupported video channel");
  if (!/^rv-[a-f0-9]{16}$/.test(String(researchRunId || ""))) throw new Error("Invalid approved research run ID");
  if (channel === "youtube" && typeof youtubeMadeForKids !== "boolean") {
    throw new Error("YouTube requires the owner's explicit per-video audience decision");
  }
  const timestamp = validReviewedSchedule(dueAt, now);
  const safeVideoUrl = assertApprovedReviewVideoUrl(videoUrl);
  const copy = String(caption ?? "");
  if (!copy.includes(DISCLOSURE) ||
      !copy.includes("blindboxai.com") ||
      !copy.includes("campaign=bb-" + researchRunId) ||
      !copy.includes("source=" + channel)) {
    throw new Error("Reviewed caption must contain first-party campaign/source and affiliate disclosure");
  }
  if (!title || typeof title !== "string" || !title.trim()) throw new Error("Approved title required");
  await verifyMediaImpl(safeVideoUrl, fetchImpl);
  if (channel === "youtube") await probeYoutubeImpl(safeVideoUrl);
  const target = await resolveChannelImpl({token, organizationId, channel, fetchImpl});
  if (!target?.id || target.service !== channel || target.isQueuePaused || target.isDisconnected || target.isLocked) {
    throw new Error("Automatic Buffer scheduled destination is not available");
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
