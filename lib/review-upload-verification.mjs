import { createHash } from "node:crypto";
import { canonicalReviewUploadUrl, isCanonicalReviewUploadPath } from "./review-upload-identity.mjs";

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

// This response adapter is called only after the route's existing staging auth.
// Client validation failures cannot initiate a storage read. Log only controlled
// diagnostics: arbitrary upstream error messages may contain sensitive details.
export async function reviewUploadVerificationResponse({ path, sizeBytes, verifyImpl = verifyReviewUpload, log = console.error }) {
  if (!isCanonicalReviewUploadPath(path)) return { status: 400, body: { error: "Invalid fingerprinted video path." } };
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) return { status: 400, body: { error: "Invalid video size." } };
  try {
    const proof = await verifyImpl({ path, sizeBytes });
    return { status: 200, body: proof };
  } catch (error) {
    const safeMessages = ["Stored video size mismatch", "Stored video fingerprint mismatch", "Stored video could not be verified"];
    const message = error instanceof Error && safeMessages.includes(error.message) ? error.message : "Storage verification request failed";
    log("free_upload_verification_failed", { message });
    return { status: 502, body: { error: "Stored video could not be verified safely." } };
  }
}
