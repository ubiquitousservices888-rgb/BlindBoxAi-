const ALLOWED_CTA_HOSTS = new Set(["blindboxai.com", "www.blindboxai.com"]);

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

export function assertBlindBoxSocialCta(record) {
  const productUrl = asHttpsUrl(record?.script?.productUrl, "BlindBoxAI CTA");
  if (!ALLOWED_CTA_HOSTS.has(productUrl.hostname.toLowerCase())) {
    throw new Error("Social CTA must point to blindboxai.com, never directly to an affiliate marketplace");
  }

  const caption = String(record?.script?.caption ?? "");
  if (!caption.includes(productUrl.toString())) {
    throw new Error("Social caption must include the BlindBoxAI CTA");
  }
  if (/https?:\/\/(?:www\.)?ebay\.com\b/i.test(caption) || /[?&]campid=\d+/i.test(caption)) {
    throw new Error("Raw eBay/EPN URLs are forbidden in social captions");
  }
  return true;
}

export async function assertPublicMp4(videoUrl, fetchImpl = fetch) {
  const url = asHttpsUrl(videoUrl, "Buffer media URL");
  if (!/\.mp4(?:$|[?#])/i.test(url.pathname + url.search + url.hash)) {
    throw new Error("Buffer media URL must point to an MP4 resource");
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`Buffer media URL is not publicly reachable: ${error.message}`);
  }

  if (![200, 206].includes(response.status)) {
    throw new Error(`Buffer media URL is not publicly accessible (HTTP ${response.status})`);
  }
  const contentType = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
  if (contentType && !contentType.includes("video/mp4") && !contentType.includes("application/octet-stream")) {
    throw new Error(`Buffer media URL returned unexpected content-type: ${contentType}`);
  }
  return true;
}

export async function assertBufferPublishReady(record, fetchImpl = fetch) {
  assertBlindBoxSocialCta(record);
  if (!record?.render?.videoUrl) throw new Error("Hosted video URL is required before Buffer publishing");
  await assertPublicMp4(record.render.videoUrl, fetchImpl);
  return true;
}
