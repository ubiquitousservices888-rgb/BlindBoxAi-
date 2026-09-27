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
  assert.match(source, /"risk-demand"/);
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
  assert.equal(requested.init.headers.apikey, "server-only-test-key");
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
