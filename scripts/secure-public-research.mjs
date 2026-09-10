import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "data", "know-it-all");
const OUT = path.join(ROOT, "latest-public-research.json");
const MANDATE = path.join(ROOT, "high-value-collectibles-research-mandate.json");
const MAX_BYTES = 2_000_000;
const SECRET_PATTERNS = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/gi,
  /gh[pousr]_[A-Za-z0-9]{20,}/gi,
  /xox[baprs]-[A-Za-z0-9-]{10,}/gi,
  /(?:api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
];

const LANE_QUERY_OVERRIDES = Object.freeze({
  "pokemon-and-tcg": "Pokemon TCG sealed booster box completed sales authentication demand",
  "graded-cards-and-slabs": "graded cards PSA slab completed sales population authentication",
  "mystery-boxes-and-repack-products": "trading card mystery box repack completed sales buyer review",
  "japanese-exclusives-and-proxy-buying": "Japanese exclusive collectible cards proxy buying completed sales authentication",
  "premium-art-toys": "premium art toy collectible completed auction sales authentication",
  "pop-mart-and-labubu": "Pop Mart Labubu blind box completed sales authentication demand",
  "collectible-protection-and-authentication-accessories": "collectible protection sleeves cases authentication accessories buyer demand",
  "autonomously-discovered-high-value-card-and-collectible-categories": "emerging high value collectible category completed sales buyer demand authentication",
});

function queryForLane(lane) {
  return LANE_QUERY_OVERRIDES[lane]
    ?? `${String(lane).replace(/-/g, " ")} completed sales buyer demand authentication`;
}

function redact(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED_SECRET]");
  return text;
}

function stripTags(value) {
  return redact(String(value ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim());
}

function extractItems(xml, source) {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, 8);
  return blocks.map((match) => {
    const block = match[0];
    const title = stripTags(block.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]);
    const description = stripTags(block.match(/<(?:description|summary|content)(?:\s[^>]*)?>([\s\S]*?)<\/(?:description|summary|content)>/i)?.[1]);
    const linkMatch = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i) || block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const feedUrl = linkMatch ? stripTags(linkMatch[1]) : null;
    const publisherMatch = block.match(/<source\b[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
    const publisherUrl = publisherMatch ? stripTags(publisherMatch[1]) : null;
    const publisher = publisherMatch ? stripTags(publisherMatch[2]) : null;
    const url = publisherUrl && /^https:\/\//i.test(publisherUrl) ? publisherUrl : feedUrl;
    const published = stripTags(block.match(/<(?:pubDate|published|updated)(?:\s[^>]*)?>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)?.[1]);
    if (!title || !url || !/^https:\/\//i.test(url)) return null;
    return {
      source: publisher || source.name,
      publisher: publisher || null,
      topic: source.topic,
      title: title.slice(0, 220),
      url: url.slice(0, 600),
      feedUrl: feedUrl?.slice(0, 600) || null,
      published: published?.slice(0, 80) || null,
      summary: description.slice(0, 700),
    };
  }).filter(Boolean);
}

function selectFindingsByLane(results, limit = 64) {
  const selected = [];
  for (let index = 0; selected.length < limit; index += 1) {
    let added = false;
    for (const result of results) {
      const item = result.items[index];
      if (!item) continue;
      selected.push(item);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  return selected;
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(source.url, { signal: controller.signal, headers: { "user-agent": "BlindBoxAI-KnowItAll/2.0 (public-research-only)" } });
    if (!response.ok) return { source, error: `HTTP ${response.status}`, items: [] };
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return { source, error: "source-too-large", items: [] };
    return { source, error: null, items: extractItems(text, source) };
  } catch (error) {
    return { source, error: error?.name === "AbortError" ? "timeout" : "fetch-failed", items: [] };
  } finally { clearTimeout(timer); }
}

const mandate = JSON.parse(await fs.readFile(MANDATE, "utf8"));
const sources = mandate.lanes.map((lane) => ({
  name: lane,
  topic: lane,
  url: `https://news.google.com/rss/search?q=${encodeURIComponent(queryForLane(lane))}&hl=en-US&gl=US&ceid=US:en`,
}));
const results = await Promise.all(sources.map(fetchSource));
const items = selectFindingsByLane(results).map((item) => ({
  ...item,
  title: redact(item.title),
  summary: redact(item.summary),
}));
const artifact = {
  schema: "blindboxai/know-it-all/public-research/v2",
  agent: "Mr. Know It All",
  mode: "credentialless-autonomous-public-research",
  researchedAt: new Date().toISOString(),
  mandate: {
    scope: mandate.scope,
    lanes: mandate.lanes,
    priority: mandate.priority,
    evidenceRules: mandate.evidenceRules,
    ranking: mandate.ranking,
  },
  security: {
    credentialsProvided: false,
    secretsRead: false,
    environmentRead: false,
    privateRepositoriesAccessed: false,
    sideEffectsPerformed: [],
    ownerApprovalRequiredForActions: true,
  },
  sources: results.map(({ source, error, items: found }) => ({ name: source.name, url: source.url, topic: source.topic, status: error ? "unavailable" : "ok", itemCount: found.length, error })),
  findings: items,
  nextStep: "Validate public findings against independent completed-sale, official-program, and authentication evidence before scoring opportunities; research cannot authorize transactions, publishing, outreach, or credential access.",
};

const serialized = redact(JSON.stringify(artifact, null, 2));
await fs.mkdir(ROOT, { recursive: true });
await fs.writeFile(OUT, serialized + "\n", "utf8");
console.log(`Wrote ${items.length} public collectible findings to ${OUT}`);
