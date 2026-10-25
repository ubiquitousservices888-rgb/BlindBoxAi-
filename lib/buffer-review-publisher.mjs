import { DISCLOSURE, bufferGraphQL } from "./daily-product-pipeline.mjs";
import {
  CAPTION_LIMITS,
  assertBufferOrganizationId,
  discoverBufferChannels,
  findExistingBufferPostPaginated,
} from "./daily-product-publish-safety.mjs";
import { assertPublicMp4 } from "./buffer-media-safety.mjs";
import { resolvePublicVideoTitle } from "./public-video-title.mjs";
import { probeYoutubeShortsMedia } from "./review-shorts-preflight.mjs";
import { publicMediaMetadataProof, publicPostMediaId } from "./public-platform-proof.mjs";

const YOUTUBE_SPORTS_CATEGORY_ID = "17";
// This is the currently authorized vidIQ channel ID. Buffer must resolve to the
// same external YouTube channel before any review video is sent.
export const REVIEW_YOUTUBE_CHANNEL_ID = "UCwaUc4e4iv2Q4P1nxlVrTvw";
const PUBLIC_POST_HOSTS = Object.freeze({
  youtube: new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]),
  tiktok: new Set(["tiktok.com", "www.tiktok.com"]),
  twitter: new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]),
});
const PUBLIC_VERIFICATION_ATTEMPTS = 61;
const PUBLIC_VERIFICATION_DELAY_MS = 5000;
const PUBLIC_VERIFICATION_TIMEOUT_MS = 300000;

function youtubeTitle(value) {
  return resolvePublicVideoTitle(value, { maxLength: 100 });
}

function validPlatformPostUrl(service, url) {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const allowedHosts = PUBLIC_POST_HOSTS[service];
  const host = url.hostname.toLowerCase();
  if (!allowedHosts?.has(host)) return false;

  if (service === "youtube") {
    if (host === "youtu.be") return /^\/[A-Za-z0-9_-]{6,}(?:\/)?$/.test(url.pathname);
    if (url.pathname === "/watch") return url.searchParams.getAll("v").length === 1 && /^[A-Za-z0-9_-]{6,}$/.test(url.searchParams.get("v") || "");
    return /^\/(?:shorts|live)\/[A-Za-z0-9_-]{6,}(?:\/)?$/.test(url.pathname);
  }
  if (service === "tiktok") {
    return /^\/@[^/]+\/video\/\d+(?:\/)?$/.test(url.pathname);
  }
  if (service === "twitter") {
    return /^\/(?:i\/web\/|[^/]+\/)status\/\d+(?:\/)?$/.test(url.pathname);
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

// Resolve only known permalink shapes locally. Never follow a redirect to
// discover a video, send credentials to a platform, or guess a media ID.
export function canonicalPublicPostUrl(channel, externalLink) {
  if (!isVerifiedPublicPostUrl(channel, externalLink)) throw new Error("Invalid public post URL");
  const url = new URL(String(externalLink).trim());
  if (channel === "youtube") return `https://www.youtube.com/watch?v=${publicPostMediaId(channel, url.toString())}`;
  if (channel === "tiktok") return `https://www.tiktok.com${url.pathname.replace(/\/$/, "")}`;
  throw new Error("Public metadata proof is unsupported for this channel");
}

// An allowed platform URL and a Buffer "sent" receipt are not HTTP proof.
// Require the exact post's available public player metadata as well as HTTP 200.
// This does not prove identical transcoded bytes, completed viewer playback,
// engagement, or affiliate conversions. Platform markup changes fail closed.
export async function probePublicPostHttp({
  channel, externalLink, fetchImpl = fetch, timeoutMs = 8000,
  now = () => new Date(),
} = {}) {
  const fail = () => {
    const error = new Error("Public platform HTTP 200 proof is unavailable; reconcile without republishing");
    error.code = "PUBLIC_VERIFICATION_PENDING";
    return error;
  };
  if (!isVerifiedPublicPostUrl(channel, externalLink)) throw fail();
  let url;
  try { url = new URL(canonicalPublicPostUrl(channel, externalLink)); } catch { throw fail(); }
  const boundedTimeout = Math.max(1000, Math.min(15000, Number(timeoutMs) || 8000));
  const controller = new AbortController();
  let reader;
  let response;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(fail()); }, boundedTimeout);
    });
    return await Promise.race([timeout, (async () => {
      response = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "text/html" },
      signal: controller.signal,
      });
      if (response?.status !== 200 || response.redirected === true ||
          (response.url && response.url !== url.toString()) ||
          !/^text\/html(?:;|$)/i.test(String(response.headers?.get?.("content-type") || "").trim())) throw fail();
      const maxBytes = 2 * 1024 * 1024;
      const declaredSize = response.headers?.get?.("content-length");
      if (declaredSize != null && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > maxBytes)) throw fail();
      reader = response.body?.getReader();
      if (!reader) throw fail();
      const decoder = new TextDecoder();
      let total = 0, html = "";
      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw fail();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw fail();
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
      const metadata = publicMediaMetadataProof(channel, url.toString(), html);
      return { status: 200, checkedAt: now().toISOString(), ...metadata };
    })()]);
  } catch {
    throw fail();
  } finally {
    clearTimeout(timer);
    controller.abort();
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch {}
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

export async function readReviewBufferPost({ token, postId, fetchImpl = fetch, timeoutMs = 12000 }) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(String(postId ?? ""))) throw new Error("Invalid Buffer post ID");
  const data = await bufferGraphQL(token,
    `query VerifySentPost($postId: PostId!) {
      post(input: { id: $postId }) {
        id text status channelId externalLink sentAt
        assets { source }
      }
    }`,
    { postId },
    (url, init) => fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) }),
  );
  const post = data?.post;
  if (post && String(post.id) !== String(postId)) throw new Error("Buffer receipt post identity mismatch");
  return post || null;
}

export async function waitForVerifiedSentPost({
  token,
  organizationId,
  channelId,
  channel,
  postId,
  expectedCaption,
  expectedVideoUrl,
  fetchImpl = fetch,
  httpProbeImpl = probePublicPostHttp,
  httpFetchImpl = fetch,
  attempts = PUBLIC_VERIFICATION_ATTEMPTS,
  delayMs = PUBLIC_VERIFICATION_DELAY_MS,
  timeoutMs = PUBLIC_VERIFICATION_TIMEOUT_MS,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  clock = () => Date.now(),
}) {
  if (!String(expectedVideoUrl ?? "").trim()) throw new Error("Approved video URL is required for receipt verification");
  const maxAttempts = Math.max(1, Math.min(120, Number(attempts) || PUBLIC_VERIFICATION_ATTEMPTS));
  const retryDelayMs = Math.max(0, Math.min(10000, Number(delayMs) || 0));
  const deadline = clock() + Math.max(1000, Math.min(PUBLIC_VERIFICATION_TIMEOUT_MS, Number(timeoutMs) || PUBLIC_VERIFICATION_TIMEOUT_MS));
  let reason = "BUFFER_POST_PENDING";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = deadline - clock();
    if (remaining <= 0) break;
    let post = null;
    try {
      post = await readReviewBufferPost({ token, postId, fetchImpl, timeoutMs: Math.max(1, Math.min(12000, remaining)) });
    } catch {
      reason = "BUFFER_LOOKUP_UNAVAILABLE";
    }
    if (post && String(post.channelId) !== String(channelId)) {
      throw new Error(`${channel}: Buffer receipt channel identity mismatch`);
    }
    if (post?.status === "error") {
      throw new Error(`${channel}: Buffer reports a publishing error; reconcile the existing post`);
    }
    // Buffer's sent state can arrive before its nullable externalLink. Keep the
    // same post ID and retry reads; this is never permission to create a post.
    if (post?.status === "sent" && !String(post.externalLink ?? "").trim()) reason = "BUFFER_PUBLIC_URL_PENDING";
    if (post?.status === "sent" && String(post.externalLink ?? "").trim()) {
      if (!Array.isArray(post.assets) || post.assets.length !== 1 || post.assets[0]?.source !== expectedVideoUrl) {
        throw new Error(`${channel}: Buffer receipt does not match the exact approved video asset`);
      }
      const publicUrl = canonicalPublicPostUrl(channel, assertVerifiedPublicPost({
        channel,
        externalLink: post.externalLink,
        text: post.text,
        expectedCaption,
      }));
      // Buffer already sent this exact post. Keep checking its metadata, never create a new post on a failed probe.
      try {
        const proof = await httpProbeImpl({ channel, externalLink: publicUrl, fetchImpl: httpFetchImpl,
          timeoutMs: Math.max(1000, Math.min(8000, deadline - clock())) });
        if (proof?.status !== 200 || proof.publicMediaAvailable !== true ||
            proof.mediaId !== publicPostMediaId(channel, publicUrl) || !Number.isFinite(Date.parse(proof.checkedAt))) {
          throw new Error("Incomplete or mismatched platform media proof");
        }
        return {
          id: post.id, publicUrl, status: post.status, sentAt: post.sentAt || null,
          publicHttpStatus: 200, publicHttpCheckedAt: proof.checkedAt,
          publicMediaAvailable: true,
        };
      } catch {
        reason = "PLATFORM_METADATA_PENDING";
      }
    }

    if (attempt + 1 < maxAttempts && retryDelayMs > 0) {
      await sleepImpl(Math.max(0, Math.min(retryDelayMs, deadline - clock())));
    }
  }

  const error = new Error(`${channel}: Buffer post was not live-verifiable before timeout (${reason}); reconcile existing post`);
  error.code = "PUBLIC_VERIFICATION_PENDING";
  error.postId = postId;
  error.reason = reason;
  throw error;
}

export async function resolveReviewBufferChannel({ token, organizationId, channel, fetchImpl = fetch }) {
  // This owner-approved publisher uses Buffer mode: "shareNow". A paused Buffer
  // schedule queue only blocks scheduled posts, so do not treat isQueuePaused as
  // a disconnected destination here. Locked/disconnected channels still fail closed.
  const active = await discoverBufferChannels({
    token,
    organizationId,
    services: [channel],
    allowQueuePaused: true,
    fetchImpl,
  });
  const matches = active.filter((candidate) => candidate.service === channel &&
    (channel !== "youtube" || candidate.serviceId === REVIEW_YOUTUBE_CHANNEL_ID));
  if (matches.length !== 1) {
    throw new Error(`${channel}: expected exactly one active Buffer channel for the approved destination, found ${matches.length}`);
  }
  return matches[0];
}

export function createReviewBufferPublisher({ token, organizationId, fetchImpl = fetch, mediaProbe = probeYoutubeShortsMedia, publicHttpProbe = probePublicPostHttp }) {
  if (!token) throw new Error("BUFFER_API_TOKEN is required");
  const targetId = assertBufferOrganizationId(organizationId);
  const resolvedChannels = new Map();

  return async ({ channel, videoUrl, caption, title, youtubeCategoryId = YOUTUBE_SPORTS_CATEGORY_ID, youtubeMadeForKids, acceptedPostId, onAccepted }) => {
    // Only supported public-player proof destinations may be sent by this publisher.
    if (!["youtube", "tiktok"].includes(channel)) {
      throw new Error(`${channel || "unknown"}: no verified public media proof; refused before Buffer publish`);
    }
    if (channel === "youtube" && typeof youtubeMadeForKids !== "boolean") {
      throw new Error("YouTube publication requires the owner's explicit Made-for-Kids decision");
    }
    await assertPublicMp4(videoUrl, fetchImpl);
    if (channel === "youtube") await mediaProbe(videoUrl);
    if (!caption?.includes(DISCLOSURE)) throw new Error("Buffer caption must include the affiliate disclosure");
    if (!caption?.includes("blindboxai.com")) throw new Error("Buffer caption must include blindboxai.com");
    const limit = CAPTION_LIMITS[channel];
    if (limit && caption.length > limit) throw new Error(`${channel}: caption exceeds ${limit} characters`);

    if (!resolvedChannels.has(channel)) {
      resolvedChannels.set(channel, await resolveReviewBufferChannel({
        token, organizationId: targetId, channel, fetchImpl,
      }));
    }
    const target = resolvedChannels.get(channel);

    // A durable submission receipt takes precedence over a time-limited caption
    // search, including when the provider is still processing or unavailable.
    if (acceptedPostId) {
      const verified = await waitForVerifiedSentPost({ token, organizationId: targetId, channelId: target.id,
        channel, postId: acceptedPostId, expectedCaption: caption, expectedVideoUrl: videoUrl, fetchImpl, httpProbeImpl: publicHttpProbe });
      return { ...verified, duplicate: true };
    }

    async function persistAccepted(postId) {
      if (!onAccepted) return;
      try { await onAccepted({ channel, postId }); }
      catch {
        const error = new Error(`${channel}: accepted Buffer post receipt could not be persisted; reconcile existing post`);
        error.code = "PUBLIC_VERIFICATION_PENDING";
        error.postId = postId;
        throw error;
      }
    }

    const existing = await findExistingBufferPostPaginated({
      token,
      organizationId: targetId,
      channelId: target.id,
      text: caption,
      fetchImpl,
    });
    if (existing?.id) {
      await persistAccepted(existing.id);
      const verified = await waitForVerifiedSentPost({
        token,
        organizationId: targetId,
        channelId: target.id,
        channel,
        postId: existing.id,
        expectedCaption: caption,
        expectedVideoUrl: videoUrl,
        fetchImpl,
        httpProbeImpl: publicHttpProbe,
      });
      return { ...verified, duplicate: true };
    }

    const input = {
      text: caption,
      channelId: target.id,
      schedulingType: "automatic",
      mode: "shareNow",
      assets: [{ video: { url: videoUrl } }],
      ...(channel === "youtube"
        ? { metadata: { youtube: {
          title: youtubeTitle(title), categoryId: String(youtubeCategoryId),
          madeForKids: youtubeMadeForKids,
          privacy: "public",
        } } }
        : {}),
    };

    const data = await bufferGraphQL(
      token,
      `mutation CreateReviewVideo($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
          ... on PostActionSuccess { post { id text status channelId } }
          ... on MutationError { message }
        }
      }`,
      { input },
      fetchImpl,
    );

    const result = data?.createPost;
    if (result?.message) throw new Error(`Buffer ${channel} publish failed: ${result.message}`);
    if (!result?.post?.id) throw new Error(`Buffer ${channel} publish returned no post ID`);
    await persistAccepted(result.post.id);
    const verified = await waitForVerifiedSentPost({
      token,
      organizationId: targetId,
      channelId: target.id,
      channel,
      postId: result.post.id,
      expectedCaption: caption,
      expectedVideoUrl: videoUrl,
      fetchImpl,
      httpProbeImpl: publicHttpProbe,
    });
    return { ...verified, duplicate: false };
  };
}
