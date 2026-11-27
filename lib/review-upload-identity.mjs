// Content-derived name for the mobile review uploader only. No storage writes.
const MAX_BYTES = 100 * 1024 * 1024;

export async function reviewUploadPath(file, cryptoImpl = globalThis.crypto) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES || typeof file.arrayBuffer !== "function") {
    throw new Error("Invalid review video size");
  }
  if (!cryptoImpl?.subtle?.digest) throw new Error("Secure video fingerprinting is unavailable. Open the HTTPS uploader again.");
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new Error("Video bytes changed while reading the file");
  const digest = new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes));
  if (digest.length !== 32) throw new Error("Invalid video fingerprint");
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  return `media/review/sha256-${hex}.mp4`;
}

const REVIEW_BASE = "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/";

export function canonicalReviewUploadUrl(path) {
  if (typeof path !== "string" || !/^media\/review\/sha256-[a-f0-9]{64}\.mp4$/.test(path)) throw new Error("Invalid fingerprinted video path");
  return REVIEW_BASE + path;
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
