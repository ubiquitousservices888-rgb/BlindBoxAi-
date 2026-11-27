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
