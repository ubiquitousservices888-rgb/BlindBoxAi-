import { createHash } from "node:crypto";
import { canonicalReviewUploadUrl } from "./review-upload-identity.mjs";

const MAX_BYTES = 100 * 1024 * 1024;

// Read-only, fixed host/path, bounded streamed bytes. No storage credential is
// sent to the public object endpoint. Never treat a conflict as byte proof.
export async function verifyReviewUpload({ path, sizeBytes, fetchImpl = fetch }) {
  const publicUrl = canonicalReviewUploadUrl(path);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) throw new Error("Invalid video size");
  const response = await fetchImpl(publicUrl, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(90000) });
  // Supabase may return 400 or 404 for a missing public object. Neither is proof
  // of absence or identity; the caller may only try a no-overwrite upload.
  if (response.status === 400 || response.status === 404) {
    await response.body?.cancel();
    return { verified: false };
  }
  if (response.status !== 200 || response.redirected || response.url !== publicUrl ||
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "video/mp4" || !response.body) {
    await response.body?.cancel();
    throw new Error("Stored video could not be verified");
  }
  const expected = path.slice("media/review/sha256-".length, -4);
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > sizeBytes) throw new Error("Stored video size mismatch");
      hash.update(value);
    }
    if (size !== sizeBytes || hash.digest("hex") !== expected) throw new Error("Stored video fingerprint mismatch");
    return { verified: true, path, publicUrl };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
