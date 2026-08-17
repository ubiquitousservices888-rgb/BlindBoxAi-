export const AUDIBLE_EPN_DISCLOSURE = "Disclosure: As an eBay Partner, BlindBoxAI may be compensated if you make a purchase.";

function hostname(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

export function isEbayDataSource(source = {}) {
  const host = hostname(source.url);
  return host === "ebay.com" || host.endsWith(".ebay.com") || /^ebay[-_]/i.test(String(source.id || ""));
}

export function sanitizeProductForGenerativeVideo(product = {}) {
  const sources = Array.isArray(product.sources) ? product.sources : [];
  const safeSources = sources.filter((source) => !isEbayDataSource(source));
  const safeIds = new Set(safeSources.map((source) => source.id));
  const safeClaims = (Array.isArray(product.claims) ? product.claims : []).filter((claim) => safeIds.has(claim.sourceId));
  if (safeClaims.length === 0) throw new Error("No non-eBay claims are available for the generative video path");
  return { ...product, sources: safeSources, claims: safeClaims };
}

export function hardenGenerativeVideoScript(script, writtenDisclosure) {
  const disclosure = String(writtenDisclosure || "").trim();
  if (!disclosure) throw new Error("Written affiliate disclosure is required");
  const existingCaption = String(script?.caption || "");
  const captionWithoutDisclosure = existingCaption.replace(disclosure, "").trim();
  const baseTitle = String(script?.title || "").replace(/^#ad\s*[•:-]?\s*/i, "").trim();
  const disclosedTitle = `#ad • ${baseTitle}`;
  const baseNarration = String(script?.narration || "")
    .replace(AUDIBLE_EPN_DISCLOSURE, "")
    .trim();
  return {
    ...script,
    title: disclosedTitle,
    displayTitle: disclosedTitle,
    narration: `${AUDIBLE_EPN_DISCLOSURE} ${baseNarration}`.trim(),
    caption: `${disclosure}\n\n${captionWithoutDisclosure}`.trim(),
  };
}

export function disclosureFirstCaption(caption, writtenDisclosure) {
  const disclosure = String(writtenDisclosure || "").trim();
  if (!disclosure) throw new Error("Written affiliate disclosure is required");
  const clean = String(caption || "").replace(disclosure, "").trim();
  return `${disclosure}\n\n${clean}`.trim();
}
