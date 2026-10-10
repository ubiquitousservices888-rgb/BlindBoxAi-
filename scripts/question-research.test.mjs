import assert from "node:assert/strict";
import test from "node:test";
import { createQuestionResearch, parseQuestionFeed, researchFreshness } from "../lib/question-research.mjs";
import { createMrKnowItAllHandler } from "../app/api/mr-know-it-all/route.js";
import { redactQuestionForStorage } from "../lib/mr-know-it-all-store.mjs";
import { runDailyResearchCheck, summarizePriceFreshness } from "../lib/daily-research-check.mjs";

const timestamp = "2026-10-10T14:00:00.000Z";
const now = () => Date.parse(timestamp);
const feed = (publisher = "https://www.pokemon.com", published = timestamp) => `<rss><channel><item>
  <title><![CDATA[Pokemon Charizard announcement]]></title><link>https://news.google.com/rss/articles/example</link>
  <source url="${publisher}">Pokemon</source><pubDate>${published}</pubDate></item></channel></rss>`;

test("freshness requires both a valid retrieval date and publication date; future dates never pass", () => {
  assert.equal(researchFreshness({ researchedAt: timestamp, published: timestamp }, now()), "fresh");
  assert.equal(researchFreshness({ researchedAt: timestamp, published: "2025-01-01" }, now()), "stale");
  assert.equal(researchFreshness({ researchedAt: timestamp }, now()), "unknown");
  assert.equal(researchFreshness({ researchedAt: timestamp, published: "2027-01-01" }, now()), "unknown");
  assert.equal(researchFreshness({ researchedAt: "2027-01-01", published: timestamp }, now()), "unknown");
});

test("RSS keeps article provenance and admits only approved HTTPS publishers", () => {
  const [item] = parseQuestionFeed(feed(), timestamp);
  assert.equal(item.url, "https://news.google.com/rss/articles/example");
  assert.equal(item.publisherUrl, "https://www.pokemon.com");
  assert.equal(item.title, "Pokemon Charizard announcement");
  assert.equal(item.verificationStatus, "research-lead");
  for (const publisher of ["https://pokemon.com.attacker.invalid", "http://pokemon.com", "https://user:pass@pokemon.com", "https://127.0.0.1"]) {
    assert.deepEqual(parseQuestionFeed(feed(publisher), timestamp), []);
  }
});

test("missing/stale evidence triggers one fixed-host credentialless GET; cache coalesces repeats", async () => {
  let calls = 0;
  const search = createQuestionResearch({ now, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url.origin, "https://news.google.com");
    assert.equal(url.pathname, "/rss/search");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal("authorization" in options.headers, false);
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(feed());
  } });
  const results = await Promise.all([search("Pokemon Charizard"), search("Pokemon Charizard")]);
  assert.equal(calls, 1);
  assert.equal(results[0].matches.length, 1);
  assert.equal(results[1].matches.length, 1);
  assert.equal((await search("pokemon charizard")).cacheHit, true);
  assert.equal(calls, 1);
});

test("fresh stored evidence skips retrieval; private and non-collectible questions never leave server", async () => {
  let calls = 0;
  const search = createQuestionResearch({ now, fetchImpl: async () => { calls += 1; throw new Error("unexpected"); } });
  const stored = { matches: [{ title: "Pokemon", url: "https://pokemon.com", researchedAt: timestamp, published: timestamp }] };
  assert.equal((await search("Pokemon", stored)).refreshStatus, "not-needed");
  for (const query of ["Pokemon email me@example.com", "Pokemon password=private", "Pokemon 1234567890123456", "Pokemon https://private.invalid", "deploy my site"]) {
    assert.equal((await search(query)).refreshStatus, "needs-public-collectible-terms");
  }
  assert.equal(calls, 0);
});

test("failed and empty refreshes retain previous dated evidence without false freshness", async () => {
  const stored = { matches: [{ title: "Pokemon older guide", researchedAt: "2025-01-01", published: "2025-01-01" }] };
  for (const response of [new Response("denied", { status: 403 }), new Response("<rss></rss>"), new Response("x".repeat(256_001))]) {
    const search = createQuestionResearch({ now, fetchImpl: async () => response });
    const result = await search("Pokemon Charizard", stored);
    assert.equal(result.matches[0].title, stored.matches[0].title);
    assert.equal(result.matches[0].freshnessStatus, "stale");
    assert.notEqual(result.refreshStatus, "refreshed");
  }
});

test("a fresh category-only lead cannot suppress research for a different exact collectible", async () => {
  let calls = 0;
  const search = createQuestionResearch({ now, fetchImpl: async () => { calls += 1; return new Response(feed()); } });
  await search("Pokemon Charizard", { matches: [{ title: "Pokemon Pikachu", researchedAt: timestamp, published: timestamp }] });
  assert.equal(calls, 1);
});

test("request budget bounds distinct searches, failures are cached and budget resets", async () => {
  let clock = now();
  let calls = 0;
  const search = createQuestionResearch({ now: () => clock, maxPerMinute: 1, fetchImpl: async () => { calls += 1; throw new Error("network private details"); } });
  assert.equal((await search("Pokemon Charizard")).refreshStatus, "unavailable");
  assert.equal((await search("Pokemon Charizard")).cacheHit, true);
  assert.equal((await search("Pokemon Pikachu")).refreshStatus, "rate-limited");
  assert.equal(calls, 1);
  clock += 60_001;
  await search("Pokemon Pikachu");
  assert.equal(calls, 2);
});

test("question research does not replace price evidence or mark leads as verified sales", async () => {
  const handler = createMrKnowItAllHandler({ recorder: async () => ({ stored: true, queued: true }),
    publicResearch: async () => ({ matches: [] }), freshResearch: createQuestionResearch({ now, fetchImpl: async () => new Response(feed()) }) });
  const response = await handler(new Request("https://blindboxai.com/api/mr-know-it-all", { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "question-research-test" }, body: JSON.stringify({ question: "Pokemon Charizard restock" }) }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.publicResearch.sourceMode, "question-search");
  assert.equal(body.publicResearch.matches[0].verificationStatus, "research-lead");
  assert.equal(body.researchQueued, true);
  assert.deepEqual(body.matches, []);
  assert.match(body.answer, /No verified sale/);
});

test("daily report uses only fixed-site GETs and flags revision mismatch without mutation", async () => {
  const requests = [];
  const report = await runDailyResearchCheck({ now: new Date(timestamp), expectedRevision: "a".repeat(40),
    catalog: [{ seriesSlug: "pokemon", freshnessStatus: "dated" }, { seriesSlug: "../../api/out/ebay", freshnessStatus: "unknown" }],
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return url.endsWith("/api/health") ? Response.json({ app: "blindboxai", status: "ok", revision: "b".repeat(40) }) : new Response("page");
    } });
  assert.equal(report.status, "attention-needed");
  assert.equal(report.pages[0].revisionMatches, false);
  assert.equal(report.prices.refreshNeeded, 2);
  assert.deepEqual(requests.map(item => new URL(item.url).pathname), ["/api/health", "/ask", "/series/pokemon"]);
  assert.ok(requests.every(item => item.options.method === "GET" && item.options.redirect === "error"));
  assert.equal(summarizePriceFreshness([]).currentPriceClaimAllowed, false);
});

test("question storage redacts credential-like and payment material", () => {
  const clean = redactQuestionForStorage("Pokemon api_key=fixture-private contact me@example.com 1234 5678 9012 3456");
  assert.doesNotMatch(clean, /fixture-private|me@example.com|1234/);
});
