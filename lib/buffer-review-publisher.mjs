import { bufferGraphQL } from "./daily-product-pipeline.mjs";
import {
  CAPTION_LIMITS,
  assertBufferOrganizationId,
  discoverBufferChannels,
  findExistingBufferPostPaginated,
} from "./daily-product-publish-safety.mjs";

const DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";
const YOUTUBE_SPORTS_CATEGORY_ID = "17";

const httpsUrl = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

function youtubeTitle(value) {
  const title = String(value ?? "").trim().replace(/[<>]/g, "").slice(0, 100).trim();
  if (!title) throw new Error("youtube: title is required");
  return title;
}

export function createReviewBufferPublisher({ token, organizationId, fetchImpl = fetch }) {
  if (!token) throw new Error("BUFFER_API_TOKEN is required");
  const targetId = assertBufferOrganizationId(organizationId);
  const resolvedChannels = new Map();

  return async ({ channel, videoUrl, caption, title, youtubeCategoryId = YOUTUBE_SPORTS_CATEGORY_ID }) => {
    if (!httpsUrl(videoUrl) || !/\.mp4(?:$|\?)/i.test(videoUrl)) throw new Error("Buffer video URL must be a hosted HTTPS MP4");
    if (!caption?.includes(DISCLOSURE)) throw new Error("Buffer caption must include the affiliate disclosure");
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
    if (existing?.id) return { id: existing.id, duplicate: true };

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
          mode: addToQueue
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
    return { id: result.post.id, duplicate: false };
  };
}
