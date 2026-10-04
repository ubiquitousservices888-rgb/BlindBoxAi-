import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  HAIR_SALON_REVIEW_FILENAME,
  HAIR_SALON_SHA256,
  loadVerifiedReviewMedia,
  verifiedReviewMediaHeaders,
} from "../lib/verified-review-media.mjs";
import { validateReviewedVideoUrl } from "../lib/review-video-url.mjs";

function response(bytes, status = 200) {
  return new Response(bytes, {
    status,
    headers: { "content-type": "video/mp4" },
  });
}

test("verified review media accepts only bytes matching pinned size and SHA-256", async () => {
  const bytes = Buffer.from("verified-review-fixture");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let requestOptions = null;

  const result = await loadVerifiedReviewMedia({
    sourceUrl: "https://example.com/review.mp4",
    expectedSha256: sha256,
    expectedSize: bytes.byteLength,
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return response(bytes);
    },
    timeoutMs: 1234,
  });

  assert.deepEqual(result, bytes);
  assert.equal(requestOptions.redirect, "follow");
  assert.equal(requestOptions.cache, "no-store");
  assert.ok(requestOptions.signal instanceof AbortSignal);
});

test("verified review media rejects changed bytes and failed sources", async () => {
  const bytes = Buffer.from("verified-review-fixture");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await assert.rejects(
    () => loadVerifiedReviewMedia({
      expectedSha256: sha256,
      expectedSize: bytes.byteLength + 1,
      fetchImpl: async () => response(bytes),
    }),
    /size mismatch/,
  );

  await assert.rejects(
    () => loadVerifiedReviewMedia({
      expectedSha256: "0".repeat(64),
      expectedSize: bytes.byteLength,
      fetchImpl: async () => response(bytes),
    }),
    /SHA-256 mismatch/,
  );

  await assert.rejects(
    () => loadVerifiedReviewMedia({
      expectedSha256: sha256,
      expectedSize: bytes.byteLength,
      fetchImpl: async () => response("missing", 404),
    }),
    /HTTP 404/,
  );
});

test("review URL validator permits only approved Blob or content-addressed BlindBoxAI MP4s", () => {
  const contentAddressed =
    `https://www.blindboxai.com/api/media/review/sha256-${HAIR_SALON_SHA256}.mp4`;

  assert.equal(validateReviewedVideoUrl(contentAddressed), contentAddressed);
  assert.equal(
    validateReviewedVideoUrl(
      "https://example.public.blob.vercel-storage.com/media/review/sample.mp4",
    ),
    "https://example.public.blob.vercel-storage.com/media/review/sample.mp4",
  );

  assert.throws(
    () => validateReviewedVideoUrl("https://www.blindboxai.com/api/media/review/sample.mp4"),
    /approved review-media namespace/,
  );
  assert.throws(
    () => validateReviewedVideoUrl(
      `https://evil.example/api/media/review/sha256-${HAIR_SALON_SHA256}.mp4`,
    ),
    /approved review-media namespace/,
  );
  assert.throws(
    () => validateReviewedVideoUrl(`${contentAddressed}?mutable=1`),
    /approved review-media namespace/,
  );
});

test("Hair Salon public review filename is content-addressed and immutable-cacheable", () => {
  assert.equal(HAIR_SALON_REVIEW_FILENAME, `sha256-${HAIR_SALON_SHA256}.mp4`);
  const headers = verifiedReviewMediaHeaders(121797);
  assert.equal(headers["content-type"], "video/mp4");
  assert.equal(headers["content-length"], "121797");
  assert.match(headers["cache-control"], /immutable/);
  assert.equal(headers["x-content-sha256"], HAIR_SALON_SHA256);
});
