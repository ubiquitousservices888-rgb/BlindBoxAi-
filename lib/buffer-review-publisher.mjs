import { DISCLOSURE, bufferGraphQL } from "./daily-product-pipeline.mjs";
import {
  CAPTION_LIMITS,
  assertBufferOrganizationId,
  discoverBufferChannels,
  findExistingBufferPostPaginated,
} from "./daily-product-publish-safety.mjs";
import { assertPublicMp4 } from "./buffer-media-safety.mjs";
import { requirePublicVideoTitle } from "./public-video-title.mjs";

const YOUTUBE_SPORTS_CATEGORY_ID = "17";
const PUBLIC_POST_HOSTS = Object.freeze({
  youtube: new Set(["youtube.com", "www.youtube.com", "youtu.be"]),
  tiktok: new Set(["tiktok.com", "www.tiktok.com"]),
  linkedin: new Set(["linkedin.com", "www.linkedin.com"]),
});
const PUBLIC_VERIFICATION_ATTEMPTS = 15;
const PUBLIC_VERIFICATION_DELAY_MS = 2000;

function youtubeTitle(value) {
  return requirePublicVideoTitle(value, { label: "youtube title", maxLength: 100 });
}

function validPlatformPostUrl(service, url) {
  if (url.protocol !== "https:" || url.port) return false;
  const allowedHosts = PUBLIC_POST_HOSTS[service];
  const host = url.hostname.toLowerCase();
  if (!allowedHosts?.has(host)) return false;

  if (service === "youtube") {
    if (host === "youtu.be") return /^\/[A-Za-z0-9_-]{6,}(?:\/)?$/.test(url.pathname);
    if (url.pathname === "/watch") return /^[A-Za-z0-9_-]{6,}$/.test(url.searchParams.get("v") || "");
    return /^\/(?:shorts|live)\/[A-Za-z0-9_-]{6,}(?:\/)?$/.test(url.pathname);
  }
  if (service === "tiktok") {
    return /^\/@[^/]+\/video\/\d+(?:\/)?$/.test(url.pathname);
  }
  if (service === "linkedin") {
    return /^\/feed\/update\/urn:li:(?:activity|share):\d+(?:\/)?$/.test(url.pathname)
      || /^\/posts\/[^/]+(?:\/)?$/.test(url.pathname);
  }
  return false;
}

export function isVerifiedPublicPostUrl(channel, externalLink) {
  const service = String(channel ?? "").trim().toLowerCase();
  try {
    return validPlatformPostUrl(service, new URL(String(externalLink ?? "").trim()));
  } catch {
    return false;
  }
}

export function assertVerifiedPublicPost({ channel, externalLink, text, expectedCaption }) {
  const service = String(channel ?? "").trim().toLowerCase();
  if (!PUBLIC_POST_HOSTS[service]) throw new Error(`${service || "unknown"}: live verification is not configured`);

  let url;
  try {
    url = new URL(String(externalLink ?? "").trim());
  } catch {
    throw new Error(`${service}: Buffer sent post has no valid public URL`);
  }
  if (!isVerifiedPublicPostUrl(service, url.toString())) {
    throw new Error(`${service}: Buffer sent post URL is not a valid public post URL`);
  }

  const liveText = String(text ?? "");
  const expected = String(expectedCaption ?? "");
  if (!liveText || liveText !== expected) {
    throw new Error(`${service}: Buffer sent post text does not match the approved caption`);
  }
  if (!liveText.includes("blindboxai.com")) {
    throw new Error(`${service}: live description is missing blindboxai.com`);
  }
  if (!liveText.includes(DISCLOSURE)) {
    throw new Error(`${service}: live description is missing the affiliate disclosure`);
  }

  return url.toString();
}

async function findBufferPostById({
  token,
  organizationId,
  channelId,
  postId,
  fetchImpl = fetch,
  now = new Date(),
}) {
  const start = new Date(now.getTime() - 45 * 86400000).toISOString();
  let after = null;
  const seenCursors = new Set();

  for (;;) {
    const data = await bufferGraphQL(
      token,
      `query VerifySentPost($organizationId: OrganizationId!, $channelIds: [ChannelId!], $startDate: DateTime!, $after: String) {
        posts(first: 50, after: $after, input: {
          organizationId: $organizationId,
          filter: { channelIds: $channelIds, status: [scheduled, sending, sent], startDate: $startDate },
          sort: [{ field: createdAt, direction: desc }]
        }) {
          edges { node { id text status channelId externalLink sentAt } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { organizationId, channelIds: [channelId], startDate: start, after },
      fetchImpl,
    );

    const posts = (data?.posts?.edges ?? []).map((edge) => edge.node);
    const match = posts.find((post) => String(post?.id) === String(postId));
    if (match) return match;

    const pageInfo = data?.posts?.pageInfo;
    if (!pageInfo?.hasNextPage) return null;
    const nextCursor = pageInfo.endCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("Buffer verification pagination returned an invalid/repeated cursor");
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }
}

export async function waitForVerifiedSentPost({
  token,
  organizationId,
  channelId,
  channel,
  postId,
  expectedCaption,
  fetchImpl = fetch,
  attempts = PUBLIC_VERIFICATION_ATTEMPTS,
  delayMs = PUBLIC_VERIFICATION_DELAY_MS,
}) {
  const maxAttempts = Math.max(1, Math.min(50, Number(attempts) || PUBLIC_VERIFICATION_ATTEMPTS));
  const retryDelayMs = Math.max(0, Math.min(10000, Number(delayMs) || 0));
  let lastLookupError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let post = null;
    try {
      post = await findBufferPostById({
        token,
        organizationId,
        channelId,
        postId,
        fetchImpl,
      });
      lastLookupError = null;
    } catch (cause) {
      lastLookupError = cause;
    }

    if (post?.status === "sent") {
      const publicUrl = assertVerifiedPublicPost({
        channel,
        externalLink: post.externalLink,
        text: post.text,
        expectedCaption,
      });
      return { id: post.id, publicUrl, status: post.status, sentAt: post.sentAt || null };
    }

    if (attempt + 1 < maxAttempts && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  const detail = lastLookupError instanceof Error ? `: ${lastLookupError.message}` : "";
  const error = new Error(`${channel}: Buffer post was not live-verifiable before timeout${detail}`);
  error.code = "PUBLIC_VERIFICATION_PENDING";
  throw error;
}

export function createReviewBufferPublisher({ token, organizationId, fetchImpl = fetch }) {
  if (!token) throw new Error("BUFFER_API_TOKEN is required");
  const targetId = assertBufferOrganizationId(organizationId);
  const resolvedChannels = new Map();

  return async ({ channel, videoUrl, caption, title, youtubeCategoryId = YOUTUBE_SPORTS_CATEGORY_ID }) => {
    await assertPublicMp4(videoUrl, fetchImpl);
    if (!caption?.includes(DISCLOSURE)) throw new Error("Buffer caption must include the affiliate disclosure");
    if (!caption?.includes("blindboxai.com")) throw new Error("Buffer caption must include blindboxai.com");
    const limit = CAPTION_LIMITS[channel];
    if (limit && caption.length > limit) throw new Error(`${channel}: caption exceeds ${limit} characters`);

    if (!resolvedChannels.has(channel)) {
      const active = await discoverBufferChannels({ token, organizationId: targetId, services: [channel], fetchImpl });
      const matches = active.filter((candidate) => candidate.service === channel);
      if (matches.length !== 1) throw new Error(`${channel}: expected exactly one active Buffer channel, found ${matches.length}`);
      resolvedChannels.set(channel, matches[0]);
    }
    const target = resolvedChannels.get(channel);

    const existing = await findExistingBufferPostPaginated({
      token,
      organizationId: targetId,
      channelId: target.id,
      text: caption,
      fetchImpl,
    });
    if (existing?.id) {
      const verified = await waitForVerifiedSentPost({
        token,
        organizationId: targetId,
        channelId: target.id,
        channel,
        postId: existing.id,
        expectedCaption: caption,
        fetchImpl,
      });
      return { ...verified, duplicate: true };
    }

    const metadata = channel === "youtube"
      ? { youtube: { title: youtubeTitle(title), categoryId: String(youtubeCategoryId) } }
      : null;

    const data = await bufferGraphQL(
      token,
      `mutation CreateReviewVideo($text: String!, $channelId: ChannelId!, $videoUrl: String!, $metadata: PostInputMetaData) {
        createPost(input: {
          text: $text
          channelId: $channelId
          schedulingType: automatic
          mode: shareNow
          assets: [{ video: { url: $videoUrl } }]
          metadata: $metadata
        }) {
          ... on PostActionSuccess { post { id text status channelId } }
          ... on MutationError { message }
        }
      }`,
      { text: caption, channelId: target.id, videoUrl, metadata },
      fetchImpl,
    );

    const result = data?.createPost;
    if (result?.message) throw new Error(`Buffer ${channel} publish failed: ${result.message}`);
    if (!result?.post?.id) throw new Error(`Buffer ${channel} publish returned no post ID`);
    const verified = await waitForVerifiedSentPost({
      token,
      organizationId: targetId,
      channelId: target.id,
      channel,
      postId: result.post.id,
      expectedCaption: caption,
      fetchImpl,
    });
    return { ...verified, duplicate: false };
  };
}
