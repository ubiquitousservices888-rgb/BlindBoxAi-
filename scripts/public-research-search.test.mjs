import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { searchRecentPublicResearch } from "../lib/public-research-search.mjs";

const ROOT = new URL("../", import.meta.url);

function readRepoFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, ROOT), "utf8");
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("scheduled research collector covers every mandate lane with two bounded search angles", () => {
  const mandate = JSON.parse(readRepoFile("data/know-it-all/high-value-collectibles-research-mandate.json"));
  const source = readRepoFile("scripts/secure-public-research.mjs");
  for (const lane of mandate.lanes) assert.match(source, new RegExp(`"${lane.replace(/[.*+?^$()|[\\]{}]/g, "\\$&")}":`));
  assert.match(source, /const SEARCH_ANGLES = \[/);
  assert.match(source, /"market"/);
  assert.match(source, /"risk-demand"/);
  assert.match(source, /mandate\.lanes\.flatMap\(\(lane\) => SEARCH_ANGLES\.map/);
  assert.match(source, /fetchSourcesBounded\(sources, 10\)/);
  assert.match(source, /item\.feedUrl/);
  assert.match(source, /\.slice\(0, 96\)/);
  assert.match(source, /scoreCollectibleOpportunity/);
  assert.match(source, /opportunityAssessment: scoreCollectibleOpportunity/);
  assert.match(source, /singleSourceConclusion: true/);
});

test("public research reader returns sanitized ranked matches without treating them as comps", async () => {
  let requested;
  const result = await searchRecentPublicResearch("Pokemon Charizard authentication", {
    supabaseUrl: "https://lazzdoadoqzrzlarerfx.supabase.co",
    serviceRoleKey: "server-only-test-key",
    fetchImpl: async (url, init) => {
      requested = { url: String(url), init };
      return response([{
        researched_at: "2026-09-27T14:17:00.000Z",
        finding_count: 2,
        source_count: 50,
        artifact: { findings: [
          { title: "Pokemon Charizard authentication guide", summary: "Collector authentication and counterfeit checks.", source: "Example", topic: "pokemon-and-tcg", url: "https://example.com/charizard", published: "Sat, 27 Sep 2026" },
          { title: "Baseball rookie update", summary: "Unrelated card market item.", source: "Example", topic: "baseball-cards", url: "https://example.com/baseball" },
        ] },
      }]);
    },
  });

  assert.equal(result.runsSearched, 1);
  assert.equal(result.findingsSearched, 2);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].title, "Pokemon Charizard authentication guide");
  assert.equal(result.matches[0].url, "https://example.com/charizard");
  assert.equal("observedLowUSD" in result.matches[0], false);
  assert.equal(new URL(requested.url).pathname, "/rest/v1/mr_know_it_all_public_research_runs");
  assert.equal(requested.init.headers.apikey, "server-only-test-key");
  assert.equal(requested.init.headers.authorization, "Bearer server-only-test-key");
  const requestedUrl = new URL(requested.url);
  assert.equal(requestedUrl.searchParams.get("order"), "researched_at.desc");
  assert.equal(requestedUrl.searchParams.get("limit"), "8");
  assert.match(requestedUrl.searchParams.get("select"), /artifact/);
});

test("public research reader rejects credential-bearing URLs", async () => {
  const result = await searchRecentPublicResearch("Pokemon", {
    supabaseUrl: "https://lazzdoadoqzrzlarerfx.supabase.co",
    serviceRoleKey: "server-only-test-key",
    fetchImpl: async () => response([{ researched_at: "2026-09-27T14:17:00.000Z", artifact: { findings: [
      { title: "Pokemon source with embedded credentials", url: "https://user:pass@example.com/private" },
      { title: "Pokemon safe source", url: "https://example.com/safe" },
    ] } }]),
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].url, "https://example.com/safe");
});

test("reader deduplicates, enforces resultLimit, and strips internal score", async () => {
  const result = await searchRecentPublicResearch("Pokemon", {
    supabaseUrl: "https://lazzdoadoqzrzlarerfx.supabase.co",
    serviceRoleKey: "server-only-test-key",
    resultLimit: 2,
    fetchImpl: async () => response([{ researched_at: "2026-09-27T14:17:00.000Z", artifact: { findings: [
      { title: "Pokemon alpha", url: "https://example.com/a" },
      { title: "Pokemon alpha", url: "https://example.com/a" },
      { title: "Pokemon beta", url: "https://example.com/b" },
      { title: "Pokemon gamma", url: "https://example.com/c" },
    ] } }]),
  });
  assert.equal(result.matches.length, 2);
  assert.equal(new Set(result.matches.map((item) => `${item.url}|${item.title}`)).size, 2);
  assert.ok(result.matches.every((item) => !("score" in item)));
});

test("unicode collectible terms remain searchable", async () => {
  const result = await searchRecentPublicResearch("ポケモン", {
    supabaseUrl: "https://lazzdoadoqzrzlarerfx.supabase.co",
    serviceRoleKey: "server-only-test-key",
    fetchImpl: async () => response([{ researched_at: "2026-09-27T14:17:00.000Z", artifact: { findings: [
      { title: "ポケモン カード 新商品", url: "https://example.com/jp" },
    ] } }]),
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].url, "https://example.com/jp");
});

test("public research query failures are explicit rather than false empty results", async () => {
  await assert.rejects(
    () => searchRecentPublicResearch("Labubu", {
      supabaseUrl: "https://lazzdoadoqzrzlarerfx.supabase.co",
      serviceRoleKey: "server-only-test-key",
      fetchImpl: async () => response({ error: "denied" }, 403),
    }),
    /failed with status 403/,
  );
});


test("stopword-only queries return a distinct no-search-terms state", async () => {
  const result = await searchRecentPublicResearch("what is this worth");
  assert.equal(result.queryStatus, "no-search-terms");
  assert.equal(result.runsSearched, 0);
});

test("malformed successful lookup payloads fail instead of reporting false zero matches", async () => {
  await assert.rejects(
    () => searchRecentPublicResearch("Labubu", {
      supabaseUrl: "https://lazzdoadoqzrzlarerfx.supabase.co",
      serviceRoleKey: "server-only-test-key",
      fetchImpl: async () => response({ rows: [] }),
    }),
    /invalid row set/,
  );
});

test("ranking uses normalized whole tokens and avoids substring false positives", async () => {
  const result = await searchRecentPublicResearch("art pokemon", {
    supabaseUrl: "https://lazzdoadoqzrzlarerfx.supabase.co",
    serviceRoleKey: "server-only-test-key",
    fetchImpl: async () => response([{ researched_at: "2026-09-27T14:17:00.000Z", artifact: { findings: [
      { title: "Cartoon part catalog", url: "https://example.com/noise" },
      { title: "Pokémon art collectible", url: "https://example.com/match" },
    ] } }]),
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].url, "https://example.com/match");
});
