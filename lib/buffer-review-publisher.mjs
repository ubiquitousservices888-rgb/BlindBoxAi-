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

function youtubeTitle(value) {
  return requirePublicVideoTitle(value, { label: "youtube title", maxLength: 100 });
}

export function createReviewBufferPublisher({ token, organizationId, fetchImpl = fetch }) {
  if (!token) throw new Error("BUFFER_API_TOKEN is required");
  const targetId = assertBufferOrganizationId(organizationId);
  const resolvedChannels = new Map();

  return async ({ channel, videoUrl, caption, title, youtubeCategoryId = YOUTUBE_SPORTS_CATEGORY_ID }) => {
    await assertPublicMp4(videoUrl, fetchImpl);
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
    return { id: result.post.id, duplicate: false };
  };
}
