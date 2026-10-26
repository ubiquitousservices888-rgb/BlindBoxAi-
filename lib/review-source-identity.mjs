import { createHash } from "node:crypto";
import { assertApprovedReviewVideoUrl } from "./review-publish-safety.mjs";

const MAX_BYTES = 32 * 1024 * 1024;
const MP4_TYPES = new Set(["video/mp4", "application/mp4", "application/octet-stream"]);

function approvedSource(value) {
  const url = new URL(assertApprovedReviewVideoUrl(value));
  if (url.username || url.password || url.port || url.hash) throw new Error("SOURCE_URL_UNAPPROVED");
  return url;
}

export function reviewSourceHost(value) {
  try {
    const url = new URL(value);
    // Hostnames only: never return paths, query strings, credentials or raw errors.
    return /^[a-z0-9.-]{1,253}$/i.test(url.hostname) ? url.hostname : "INVALID_HOST";
  } catch { return "INVALID_HOST"; }
}

async function digestSource(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer, response, reader;
  const fail = (reason) => Object.assign(new Error("Source-byte verification unavailable"), { sourceProofReason: reason });
  try {
    return await Promise.race([
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(fail("SOURCE_TIMEOUT")); }, timeoutMs); }),
      (async () => {
        response = await fetchImpl(url.href, { method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
          headers: { Accept: "video/mp4, application/mp4, application/octet-stream" }, signal: controller.signal });
        if (response.status !== 200) throw fail("SOURCE_HTTP_STATUS");
        if (response.redirected || (response.url && response.url !== url.href)) throw fail("SOURCE_REDIRECT");
        if (!MP4_TYPES.has(String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase())) throw fail("SOURCE_CONTENT_TYPE");
        const declared = response.headers.get("content-length");
        if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw fail("SOURCE_SIZE_LIMIT");
        reader = response.body?.getReader();
        if (!reader) throw fail("SOURCE_BODY_UNREADABLE");
        const hash = createHash("sha256");
        let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) throw fail("SOURCE_TIMEOUT");
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) throw fail("SOURCE_SIZE_LIMIT");
          hash.update(value);
        }
        if (!bytes || (declared !== null && Number(declared) !== bytes)) throw fail("SOURCE_SIZE_MISMATCH");
        return { sha256: hash.digest("hex"), sizeBytes: bytes };
      })(),
    ]);
  } catch (error) {
    if (error?.sourceProofReason) throw error;
    throw fail("SOURCE_REQUEST_FAILED");
  } finally {
    clearTimeout(timer);
    controller.abort();
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch {}
  }
}

// Historical reconciliation only. This neither changes the live publisher's
// exact-URL contract nor accepts perceptual/transcode similarity as byte proof.
export function createReviewSourceVerifier({ fetchImpl = fetch, timeoutMs = 20000, now = () => new Date() } = {}) {
  const cache = new Map();
  const boundedTimeout = Math.max(10, Math.min(30000, Number(timeoutMs) || 20000));
  function digest(url) {
    if (!cache.has(url.href)) cache.set(url.href, digestSource(url, fetchImpl, boundedTimeout));
    return cache.get(url.href);
  }
  return async ({ approvedUrl, sourceUrl, expectedSizeBytes }) => {
    let approved, source;
    try { approved = approvedSource(approvedUrl); source = approvedSource(sourceUrl); }
    catch { return { matched: false, reason: "SOURCE_URL_UNAPPROVED", sourceHost: reviewSourceHost(sourceUrl) }; }
    if (approved.href === source.href) return { matched: true, method: "EXACT_URL" };
    try {
      const [expected, observed] = await Promise.all([digest(approved), digest(source)]);
      const sizeMatches = expectedSizeBytes == null || (Number.isSafeInteger(expectedSizeBytes) && expectedSizeBytes > 0 && expected.sizeBytes === expectedSizeBytes);
      const matched = sizeMatches && expected.sha256 === observed.sha256 && expected.sizeBytes === observed.sizeBytes;
      return { matched, method: "SHA256", approvedSha256: expected.sha256, sourceSha256: observed.sha256,
        approvedSizeBytes: expected.sizeBytes, sourceSizeBytes: observed.sizeBytes, checkedAt: now().toISOString(),
        ...(matched ? {} : { reason: sizeMatches ? "SOURCE_BYTES_DIFFER" : "APPROVED_SOURCE_SIZE_MISMATCH" }) };
    } catch (error) { return { matched: false, reason: error.sourceProofReason || "SOURCE_REQUEST_FAILED" }; }
  };
}
