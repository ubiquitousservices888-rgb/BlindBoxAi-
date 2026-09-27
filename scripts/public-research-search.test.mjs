import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { searchRecentPublicResearch } from "../lib/public-research-search.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("scheduled research collector covers every mandate lane with two bounded search angles", () => {
  const mandate = JSON.parse(fs.readFileSync("data/know-it-all/high-value-collectibles-research-mandate.json", "utf8"));
  const source = fs.readFileSync("scripts/secure-public-research.mjs", "utf8");
  for (const lane of mandate.lanes) assert.match(source, new RegExp(`"${lane.replace(/[.*+?^$()|[\\]{}]/g, "\\$&")}":`));
  assert.match(source, /const SEARCH_ANGLES = \[/);
  assert.match(source, /"market"/);
  assert.match(source, /"risk-demand"/);\n  assert.match(source, /mandate\\.lanes\\.flatMap\\(\\(lane\\) => SEARCH_ANGLES\\.map/);
  assert.match(source, /\.slice\(0, 96\)/);
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
  assert.equal(requested.init.headers.apikey, "server-only-test-key");\n  assert.equal(requested.init.headers.authorization, "Bearer server-only-test-key");\n  const requestedUrl = new URL(requested.url);\n  assert.equal(requestedUrl.searchParams.get("order"), "researched_at.desc");\n  assert.equal(requestedUrl.searchParams.get("limit"), "8");\n  assert.match(requestedUrl.searchParams.get("select"), /artifact/);
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
