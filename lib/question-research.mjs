import { classifyQuestionVertical } from "./mr-know-it-all-store.mjs";

const RETRIEVAL_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const PUBLICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SENSITIVE = /https?:\/\/|www\.|@|\b(?:password|secret|token|api.?key|private.?key|ssn|address)\b|\b(?:\d[ -]*){9,}\b|\b(?:sk-|gh[pousr]_|xox[baprs]-)|-----BEGIN/i;
const SOURCES = new Set(["popmart.com", "pokemon.com", "pokemoncenter.com", "magic.wizards.com", "yugioh-card.com", "topps.com", "paniniamerica.net", "upperdeck.com", "beckett.com", "psacard.com", "cgccomics.com", "cgccards.com", "tcgplayer.com", "lorcana.com", "en.onepiece-cardgame.com", "sanrio.com", "sonnyangel.com", "smiski.com", "funko.com"]);
// Established retail/hobby/game coverage is discovery evidence only, never sale proof.
for (const host of ["corporate.target.com", "gamespot.com", "ign.com", "polygon.com", "snkrdunk.com", "wargamer.com", "toybook.com", "thetoyinsider.com"]) SOURCES.add(host);

export function researchFreshness(item, now = Date.now()) {
  const retrieved = Date.parse(item?.researchedAt || "");
  const published = Date.parse(item?.published || "");
  if (!Number.isFinite(retrieved) || !Number.isFinite(published) || retrieved > now || published > now) return "unknown";
  return now - retrieved <= RETRIEVAL_MAX_AGE_MS && now - published <= PUBLICATION_MAX_AGE_MS ? "fresh" : "stale";
}

function text(value, max = 500) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function tag(block, name) {
  return text(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1]);
}

function approvedPublisher(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && SOURCES.has(url.hostname.replace(/^www\./, ""));
  } catch { return false; }
}

export function parseQuestionFeed(xml, researchedAt) {
  const matches = [];
  const seen = new Set();
  for (const [block] of String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const publisherUrl = text(block.match(/<source\b[^>]*url=["']([^"']+)["']/i)?.[1]);
    if (!approvedPublisher(publisherUrl)) continue;
    const title = tag(block, "title");
    const url = tag(block, "link");
    let link;
    try { link = new URL(url); } catch { continue; }
    // Keep the article link, not the publisher homepage. Never fetch arbitrary links.
    if (link.protocol !== "https:" || link.hostname !== "news.google.com" || !link.pathname.startsWith("/rss/articles/") || link.username || link.password) continue;
    if (!title || SENSITIVE.test(title) || seen.has(url)) continue;
    seen.add(url);
    const item = { title: title.slice(0, 220), url, source: tag(block, "source"), publisherUrl,
      published: tag(block, "pubDate") || null, researchedAt, summary: "", verificationStatus: "research-lead" };
    matches.push({ ...item, freshnessStatus: researchFreshness(item, Date.parse(researchedAt)) });
    if (matches.length === 100) break;
  }
  return matches.sort((a, b) => Number(b.freshnessStatus === "fresh") - Number(a.freshnessStatus === "fresh") ||
    (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)).slice(0, 6);
}

function matchesQuestion(query, item) {
  const words = value => String(value || "").normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const stop = new Set(["a", "an", "are", "the", "what", "is", "how", "where", "when", "can", "i", "my", "for", "of", "to", "it", "this", "that", "and", "please"]);
  const identity = words(query).filter(word => word.length > 1 && !stop.has(word));
  const source = new Set(words(`${item.title || ""} ${item.summary || ""}`));
  return identity.length > 0 && identity.every(word => source.has(word));
}

async function boundedText(response, maxBytes = 256_000) {
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("source-too-large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("source-too-large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}

// Cache and budget are per server instance. They are not a global rate-limit claim.
export function createQuestionResearch({ fetchImpl = fetch, now = Date.now, maxCache = 100, maxPerMinute = 6 } = {}) {
  const cache = new Map();
  const inflight = new Map();
  let windowStart = now();
  let searches = 0;
  return async function researchQuestion(query, stored = {}) {
    const checkedAt = now();
    const storedMatches = (Array.isArray(stored.matches) ? stored.matches : []).map(item => ({
      ...item, freshnessStatus: researchFreshness(item, checkedAt), verificationStatus: "research-lead",
    }));
    const base = { ...stored, matches: storedMatches, sourceMode: "stored", checkedAt: new Date(checkedAt).toISOString() };
    if (storedMatches.some(item => item.freshnessStatus === "fresh" && matchesQuestion(query, item))) return { ...base, refreshStatus: "not-needed" };
    const clean = String(query || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    if (clean.length < 3 || clean.length > 120 || SENSITIVE.test(clean) || !classifyQuestionVertical(clean)) {
      return { ...base, refreshStatus: "needs-public-collectible-terms" };
    }
    const key = clean.toLowerCase();
    const saved = cache.get(key);
    if (saved && saved.expiresAt > checkedAt) return { ...base, ...saved.result, cacheHit: true };
    if (inflight.has(key)) {
      const result = await inflight.get(key);
      return { ...base, ...result, matches: result.matches?.length ? result.matches : storedMatches, cacheHit: true };
    }
    if (checkedAt - windowStart >= 60_000) { windowStart = checkedAt; searches = 0; }
    if (searches >= maxPerMinute) return { ...base, refreshStatus: "rate-limited" };
    searches += 1;
    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const url = new URL("https://news.google.com/rss/search");
        url.searchParams.set("q", clean);
        url.searchParams.set("hl", "en-US");
        url.searchParams.set("gl", "US");
        url.searchParams.set("ceid", "US:en");
        const response = await fetchImpl(url, { method: "GET", redirect: "error", signal: controller.signal,
          headers: { "user-agent": "BlindBoxAI-public-question-research/1.0" } });
        if (!response.ok) throw new Error("source-unavailable");
        const matches = parseQuestionFeed(await boundedText(response), new Date(checkedAt).toISOString());
        return { matches, sourceMode: "question-search", refreshStatus: matches.length ? "refreshed" : "no-approved-sources",
          latestResearchedAt: new Date(checkedAt).toISOString(), status: "ok" };
      } catch { return { refreshStatus: "unavailable" }; }
      finally { clearTimeout(timeout); }
    })();
    inflight.set(key, request);
    try {
      const result = await request;
      // On failed/empty refresh preserve historical leads; never replace them with false absence.
      const merged = { ...result, matches: result.matches?.length ? result.matches : storedMatches };
      cache.delete(key);
      cache.set(key, { result: merged, expiresAt: checkedAt + (result.refreshStatus === "refreshed" ? 15 * 60_000 : 60_000) });
      while (cache.size > maxCache) cache.delete(cache.keys().next().value);
      return { ...base, ...merged };
    } finally { inflight.delete(key); }
  };
}
