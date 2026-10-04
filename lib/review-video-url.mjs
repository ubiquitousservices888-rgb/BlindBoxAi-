function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

const CONTENT_ADDRESSED_REVIEW_PATH =
  /^\/api\/media\/review\/sha256-[a-f0-9]{64}\.mp4$/;

export function validateReviewedVideoUrl(value) {
  const text = required(value, "REVIEWED_VIDEO_URL");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("REVIEWED_VIDEO_URL must be a valid URL");
  }

  if (url.protocol !== "https:" || !/\.mp4$/i.test(url.pathname)) {
    throw new Error("REVIEWED_VIDEO_URL must be an HTTPS MP4");
  }

  const host = url.hostname.toLowerCase();
  const approvedBlob =
    host.endsWith(".public.blob.vercel-storage.com") &&
    url.pathname.startsWith("/media/review/");
  const approvedBlindBoxContentAddressedRoute =
    host === "www.blindboxai.com" &&
    !url.port &&
    !url.search &&
    !url.hash &&
    CONTENT_ADDRESSED_REVIEW_PATH.test(url.pathname);

  if (!approvedBlob && !approvedBlindBoxContentAddressedRoute) {
    throw new Error(
      "REVIEWED_VIDEO_URL must use an approved review-media namespace",
    );
  }

  return url.toString();
}
