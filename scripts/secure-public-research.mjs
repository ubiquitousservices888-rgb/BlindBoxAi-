import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "data", "know-it-all");
const OUT = path.join(ROOT, "latest-public-research.json");
const MAX_BYTES = 2_000_000;
const SECRET_PATTERNS = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/gi,
  /gh[pousr]_[A-Za-z0-9]{20,}/gi,
  /xox[baprs]-[A-Za-z0-9-]{10,}/gi,
  /(?:api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
];

const SOURCES = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", topic: "AI" },
  { name: "GitHub Changelog", url: "https://github.blog/changelog/feed/", topic: "developer-platform" },
  { name: "Vercel Blog", url: "https://vercel.com/atom", topic: "web-platform" },
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", topic: "AI" },
];

function redact(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED_SECRET]");
  return text;
}

function stripTags(value) {
  return redact(String(value ?? "").replace(/<script[\\s\\S]*?<\\/script>/gi, " ").replace(/<style[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\s+/g, " ").trim());
}

function extractItems(xml, source) {
  const blocks = [...xml.matchAll(/<(?:item|entry)\\b[\\s\\S]*?<\\/(?:item|entry)>/gi)].slice(0, 8);
  return blocks.map((match) => {
    const block = match[0];
    const title = stripTags(block.match(/<title(?:\\s[^>]*)?>([\\s\\S]*?)<\\/title>/i)?.[1]);
    const description = stripTags(block.match(/<(?:description|summary|content)(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:description|summary|content)>/i)?.[1]);
    const linkMatch = block.match(/<link(?:\\s[^>]*)?>([\\s\\S]*?)<\\/link>/i) || block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const url = linkMatch ? stripTags(linkMatch[1]) : null;
    const published = stripTags(block.match(/<(?:pubDate|published|updated)(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:pubDate|published|updated)>/i)?.[1]);
    if (!title || !url || !/^https:\\/\\//i.test(url)) return null;
    return { source: source.name, topic: source.topic, title: title.slice(0, 220), url: url.slice(0, 600), published: published?.slice(0, 80) || null, summary: description.slice(0, 700) };
  }).filter(Boolean);
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(source.url, { signal: controller.signal, headers: { "user-agent": "BlindBoxAI-KnowItAll/1.0 (public-research-only)" } });
    if (!response.ok) return { source, error: `HTTP ${response.status}`, items: [] };
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return { source, error: "source-too-large", items: [] };
    return { source, error: null, items: extractItems(text, source) };
  } catch (error) {
    return { source, error: error?.name === "AbortError" ? "timeout" : "fetch-failed", items: [] };
  } finally { clearTimeout(timer); }
}

const results = await Promise.all(SOURCES.map(fetchSource));
const items = results.flatMap((result) => result.items).map((item) => ({ ...item, title: redact(item.title), summary: redact(item.summary) }));
const artifact = {
  schema: "blindboxai/know-it-all/public-research/v1",
  agent: "Mr. Know It All",
  mode: "credentialless-autonomous-public-research",
  researchedAt: new Date().toISOString(),
  security: {
    credentialsProvided: false,
    secretsRead: false,
    environmentRead: false,
    privateRepositoriesAccessed: false,
    sideEffectsPerformed: [],
    ownerApprovalRequiredForActions: true,
  },
  sources: results.map(({ source, error, items: found }) => ({ name: source.name, url: source.url, topic: source.topic, status: error ? "unavailable" : "ok", itemCount: found.length, error })),
  findings: items.slice(0, 32),
  nextStep: "Feed verified public findings into the knowledge flywheel after validation; research cannot authorize transactions, publishing, outreach, or credential access.",
};

const serialized = redact(JSON.stringify(artifact, null, 2));
await fs.mkdir(ROOT, { recursive: true });
await fs.writeFile(OUT, serialized + "\\n", "utf8");
console.log(`Wrote ${items.length} public findings to ${OUT}`);
