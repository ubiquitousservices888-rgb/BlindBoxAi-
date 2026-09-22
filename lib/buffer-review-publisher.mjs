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
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
});
const PUBLIC_VERIFICATION_ATTEMPTS = 15;
const PUBLIC_VERIFICATION_DELAY_MS = 2000;

function youtubeTitle(value) {
  return requirePublicVideoTitle(value, { label: "youtube title", maxLength: 100 });
}

function hostMatches(hostname, root) {
  return hostname === root || hostname.endsWith(`.${root}`);
}

export function assertVerifiedPublicPost({ channel, externalLink, text, expectedCaption }) {
  const service = String(channel ?? "").trim().toLowerCase();
  const allowedHosts = PUBLIC_POST_HOSTS[service];
  if (!allowedHosts) throw new Error(`${service || "unknown"}: live verification is not configured`);

  let url;
  try {
    url = new URL(String(externalLink ?? "").trim());
  } catch {
    throw new Error(`${service}: Buffer sent post has no valid public URL`);
  }
  if (url.protocol !== "https:" || !allowedHosts.some((root) => hostMatches(url.hostname.toLowerCase(), root))) {
    throw new Error(`${service}: Buffer sent post URL is not on the expected public host`);
  }

  const liveText = String(text ?? "").trim();
  const expected = String(expectedCaption ?? "").trim();
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
  const start = new Date(now.getTime() - 7 * 86400000).toISOString();
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

async function waitForVerifiedSentPost({
  token,
  organizationId,
  channelId,
  channel,
  postId,
  expectedCaption,
  fetchImpl = fetch,
}) {
  for (let attempt = 0; attempt < PUBLIC_VERIFICATION_ATTEMPTS; attempt++) {
    const post = await findBufferPostById({
      token,
      organizationId,
      channelId,
      postId,
      fetchImpl,
    });
    if (post?.status === "sent") {
      const publicUrl = assertVerifiedPublicPost({
        channel,
        externalLink: post.externalLink,
        text: post.text,
        expectedCaption,
      });
      return { id: post.id, publicUrl, status: post.status, sentAt: post.sentAt || null };
    }
    if (attempt + 1 < PUBLIC_VERIFICATION_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, PUBLIC_VERIFICATION_DELAY_MS));
    }
  }

  const error = new Error(`${channel}: Buffer post was not live-verifiable before timeout`);
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
