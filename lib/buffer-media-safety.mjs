const ALLOWED_CTA_HOSTS = new Set(["blindboxai.com", "www.blindboxai.com"]);
const ALLOWED_MP4_TYPES = new Set(["video/mp4", "application/mp4", "application/octet-stream"]);

function asHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return url;
}

function isPrivateHostname(value) {
  const hostname = String(value ?? "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".home.arpa")) return true;

  const parts = hostname.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
    const octets = parts.map(Number);
    if (octets.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }

  if (!hostname.includes(":")) return false;
  return hostname === "::" || hostname === "::1" || hostname.startsWith("fc") ||
    hostname.startsWith("fd") || /^fe[89ab]/.test(hostname) || hostname.startsWith("::ffff:");
}

function assertPublicHttpsUrl(value, label) {
  const url = asHttpsUrl(value, label);
  if (isPrivateHostname(url.hostname)) throw new Error(`${label} must use a public host`);
  return url;
}

function captionUrls(caption) {
  return (String(caption).match(/https?:\/\/[^\s<>"']+/gi) ?? [])
    .map((value) => value.replace(/[),.!?;:}\]]+$/g, ""))
    .map((value) => { try { return new URL(value); } catch { return null; } })
    .filter(Boolean);
}

function isEbayHostname(value) {
  const hostname = String(value ?? "").toLowerCase().replace(/\.$/, "");
  return /^(?:[^.]+\.)*ebay\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(hostname);
}

export function assertBlindBoxSocialCta(record) {
  const rawProductUrl = String(record?.script?.productUrl ?? "").trim();
  const productUrl = asHttpsUrl(rawProductUrl, "BlindBoxAI CTA");
  if (!ALLOWED_CTA_HOSTS.has(productUrl.hostname.toLowerCase())) {
    throw new Error("Social CTA must point to blindboxai.com, never directly to an affiliate marketplace");
  }

  const caption = String(record?.script?.caption ?? "");
  if (!caption.includes(rawProductUrl)) {
    throw new Error("Social caption must include the BlindBoxAI CTA");
  }
  for (const url of captionUrls(caption)) {
    const hasCampId = [...url.searchParams.keys()].some((key) => key.toLowerCase() === "campid");
    if (isEbayHostname(url.hostname) || hasCampId) {
      throw new Error("Raw eBay/EPN URLs are forbidden in social captions");
    }
  }
  return true;
}

export async function assertPublicMp4(videoUrl, fetchImpl = fetch) {
  const url = assertPublicHttpsUrl(videoUrl, "Buffer media URL");
  if (!/\.mp4$/i.test(url.pathname)) {
    throw new Error("Buffer media URL must point to an MP4 resource");
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`Buffer media URL is not publicly reachable: ${error.message}`);
  }

  try {
    if (response.redirected || (response.url && new URL(response.url).href !== url.href)) {
      throw new Error("Buffer media URL must not redirect");
    }
    if (![200, 206].includes(response.status)) {
      throw new Error(`Buffer media URL is not publicly accessible (HTTP ${response.status})`);
    }
    const contentType = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
    const mimeType = contentType.split(";", 1)[0].trim();
    if (mimeType && !ALLOWED_MP4_TYPES.has(mimeType)) {
      throw new Error(`Buffer media URL returned unexpected content-type: ${contentType}`);
    }
  } finally {
    try {
      await response.body?.cancel?.();
    } catch {
      // Best effort: validation must not retain or download the full media body.
    }
  }
  return true;
}

export async function assertBufferPublishReady(record, fetchImpl = fetch) {
  assertBlindBoxSocialCta(record);
  if (!record?.render?.videoUrl) throw new Error("Hosted video URL is required before Buffer publishing");
  await assertPublicMp4(record.render.videoUrl, fetchImpl);
  return true;
}
