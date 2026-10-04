import { createHash } from "node:crypto";

export const HAIR_SALON_SOURCE_URL =
  "https://github.com/ubiquitousservices888-rgb/BlindBoxAi-/releases/download/blindbox-video-assets/2026-08-30-labubu-hair-salon-vinyl-plush-pendant-verified.mp4";
export const HAIR_SALON_SHA256 =
  "7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0";
export const HAIR_SALON_SIZE = 121797;
export const HAIR_SALON_REVIEW_FILENAME = `sha256-${HAIR_SALON_SHA256}.mp4`;

export async function loadVerifiedReviewMedia({
  sourceUrl = HAIR_SALON_SOURCE_URL,
  expectedSha256 = HAIR_SALON_SHA256,
  expectedSize = HAIR_SALON_SIZE,
  fetchImpl = fetch,
  timeoutMs = 30_000,
} = {}) {
  const response = await fetchImpl(sourceUrl, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Verified review source fetch failed: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expectedSize) {
    throw new Error("Verified review source size mismatch");
  }

  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedSha256) {
    throw new Error("Verified review source SHA-256 mismatch");
  }

  return bytes;
}

export function verifiedReviewMediaHeaders(size = HAIR_SALON_SIZE) {
  return {
    "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    "content-disposition": `inline; filename="${HAIR_SALON_REVIEW_FILENAME}"`,
    "content-length": String(size),
    "content-type": "video/mp4",
    "x-content-sha256": HAIR_SALON_SHA256,
  };
}
