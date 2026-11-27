import { sha256 } from "./vendor/js-sha256/sha256.min.mjs";
import { BLINDBOXAI_SUPABASE_ORIGIN } from "./blindbox-supabase-boundary.mjs";

// Content-derived name for the mobile review uploader only. No storage writes.
const MAX_BYTES = 100 * 1024 * 1024;
const HASH_CHUNK_BYTES = 256 * 1024;

export async function reviewUploadPath(file, cryptoImpl = globalThis.crypto) {
  const size = file?.size;
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES || typeof file.slice !== "function") {
    throw new Error("Invalid review video size");
  }
  // Preserve the secure-context requirement even though the incremental hash
  // is computed by a pinned, vendored upstream implementation.
  if (!cryptoImpl?.subtle?.digest) throw new Error("Secure video fingerprinting is unavailable. Open the HTTPS uploader again.");
  const hash = sha256.create();
  for (let start = 0; start < size; start += HASH_CHUNK_BYTES) {
    const end = Math.min(start + HASH_CHUNK_BYTES, size);
    const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
    if (bytes.byteLength !== end - start) throw new Error("Video bytes changed while reading the file");
    hash.update(bytes);
  }
  if (file.size !== size) throw new Error("Video bytes changed while reading the file");
  const hex = hash.hex();
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("Invalid video fingerprint");
  return `media/review/sha256-${hex}.mp4`;
}

const REVIEW_BASE = `${BLINDBOXAI_SUPABASE_ORIGIN}/storage/v1/object/public/blindboxai-review-videos/`;

export function isCanonicalReviewUploadPath(path) {
  return typeof path === "string" && /^media\/review\/sha256-[a-f0-9]{64}\.mp4$/.test(path);
}

export function canonicalReviewUploadUrl(path) {
  if (!isCanonicalReviewUploadPath(path)) throw new Error("Invalid fingerprinted video path");
  return REVIEW_BASE + path;
}

export function normalizeReviewUploadError(error) {
  const message = error instanceof Error ? error.message : "Upload failed.";
  if (/token has expired|(?:upload )?ticket (?:has )?expired|authorization expired/i.test(message)) return "Upload authorization expired. Tap Upload & stage for research again.";
  if (/^ticket_failed$/i.test(message)) return "Unable to authorize free video storage.";
  if (/timed? ?out|timeout/i.test(message)) return "Upload timed out. Keep this page open and retry once.";
  if (/abort/i.test(message)) return "Upload interrupted. Retry to check existing storage.";
  return message;
}

// An existing object must be verified by the authenticated server, not by an
// upload conflict or a filename. This flow never retries a mutating PUT.
export async function uploadOrRecoverReviewMedia({ file, verifyExisting, requestTicket, upload }) {
  const path = await reviewUploadPath(file);
  const publicUrl = canonicalReviewUploadUrl(path);
  const params = { path, sizeBytes: file.size };
  const result = { url: publicUrl, pathname: path };
  async function recover() {
    const proof = await verifyExisting(params);
    if (proof?.verified === false) return false;
    if (proof?.verified !== true || proof.path !== path || proof.publicUrl !== publicUrl) throw new Error("Invalid stored video verification");
    return true;
  }
  if (await recover()) return result;
  try {
    const ticket = await requestTicket(params);
    if (ticket?.path !== path || ticket.publicUrl !== publicUrl || !ticket.signedUrl) throw new Error("Upload ticket does not match the video fingerprint");
    await upload(ticket);
  } catch (cause) {
    if (await recover()) return result;
    throw cause;
  }
  return result;
}
