const SUPABASE_REVIEW_HOST = "lazzdoadoqzrzlarerfx.supabase.co";
const SUPABASE_REVIEW_PREFIX = "/storage/v1/object/public/blindboxai-review-videos/media/review/";
const VERCEL_REVIEW_SUFFIX = ".public.blob.vercel-storage.com";
const VERCEL_REVIEW_PREFIX = "/media/review/";

export const MAX_BUFFER_POSTS_PER_EXECUTION = 1;

export function assertApprovedReviewVideoUrl(value) {
  const text = String(value ?? "").trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("review video URL must be valid");
  }
  if (url.protocol !== "https:") throw new Error("review video URL must use HTTPS");

  const supabaseAllowed =
    url.hostname === SUPABASE_REVIEW_HOST &&
    url.pathname.startsWith(SUPABASE_REVIEW_PREFIX);

  const vercelAllowed =
    url.hostname.endsWith(VERCEL_REVIEW_SUFFIX) &&
    url.pathname.startsWith(VERCEL_REVIEW_PREFIX);

  if (!supabaseAllowed && !vercelAllowed) {
    throw new Error("review video URL is not on an approved BlindBoxAI media host");
  }
  if (!/\.mp4$/i.test(url.pathname)) {
    throw new Error("review video URL must point to an MP4");
  }
  return url.toString();
}

export function cappedPublishChannels(value) {
  const channels = [...new Set(String(value ?? "youtube,tiktok,linkedin")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean))];
  if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one service");
  return {
    selected: channels.slice(0, MAX_BUFFER_POSTS_PER_EXECUTION),
    deferred: channels.slice(MAX_BUFFER_POSTS_PER_EXECUTION),
  };
}

export function isDryRun(value) {
  return /^(?:1|true|yes)$/i.test(String(value ?? "").trim());
}
