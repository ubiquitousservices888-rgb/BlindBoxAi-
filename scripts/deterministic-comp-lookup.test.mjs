import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDeterministicCompResponse,
  loadVerifiedCompCatalog,
  lookupVerifiedComps,
} from "../lib/deterministic-comp-lookup.mjs";
import { evaluateAffiliateEligibility } from "../lib/market-eligibility.mjs";
import { buildCatalogSnapshot } from "../lib/mr-know-it-all-agent.mjs";
import { recordKnowItAllQuestion } from "../lib/mr-know-it-all-store.mjs";

const catalog = [
  {
    brand: "Pop Mart",
    series: "Hirono Mist-Walker Plush Pendant",
    seriesSlug: "hirono-mist-walker",
    figure: "The Tempered Aegis",
    rarity: "secret",
    observedLowUSD: 152,
    observedHighUSD: 165,
    evidence: "2 reviewed sales",
    checklist: [],
    reviewStatus: "reviewed",
  },
  {
    brand: "Pop Mart",
    series: "Hirono Mist-Walker Plush Pendant",
    seriesSlug: "hirono-mist-walker",
    figure: "The Wingless Follower",
    rarity: "common",
    observedLowUSD: 45,
    observedHighUSD: 70,
    evidence: "5 reviewed sales",
    checklist: [],
    reviewStatus: "reviewed",
  },
];

test("exact figure lookup ranks the matching reviewed record first", () => {
  const results = lookupVerifiedComps("The Tempered Aegis", { catalog });
  assert.equal(results[0].figure, "The Tempered Aegis");
  assert.equal(results[0].observedLowUSD, 152);
});

test("series lookup returns deterministic reviewed results", () => {
  const results = lookupVerifiedComps("Hirono Mist Walker", { catalog });
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.reviewStatus === "reviewed"));
});

test("public lookup and AI snapshot share the two-sale verifier", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blindboxai-shared-verifier-"));
  const fixture = {
    slug: "shared-verifier-test",
    name: "Shared Verifier Test",
    brand: "Test Brand",
    checklist: ["Compare packaging against the official reference."],
    figures: [
      {
        name: "One Sale Figure",
        rarity: "common",
        resaleLow: 10,
        resaleHigh: 10,
        evidence: "1 completed sale Sep 1 2026: $10.00",
        needsReview: false,
      },
      {
        name: "Two Sale Figure",
        rarity: "secret",
        resaleLow: 20,
        resaleHigh: 25,
        evidence: "2 completed US sales Sep 1 and Sep 2 2026: $20.00 and $25.00",
        needsReview: false,
      },
      {
        name: "Pending Figure",
        rarity: "common",
        resaleLow: 30,
        resaleHigh: 35,
        evidence: "2 completed US sales Sep 3 and Sep 4 2026: $30.00 and $35.00",
        needsReview: true,
      },
    ],
  };

  try {
    fs.writeFileSync(path.join(dir, "shared-verifier-test.json"), JSON.stringify(fixture));

    const eligibility = evaluateAffiliateEligibility(fixture);
    assert.equal(eligibility.verifiedMarketRecordCount, 1);
    assert.equal(eligibility.verifiedMarketRecords[0].figure, "Two Sale Figure");
    assert.equal(eligibility.verifiedMarketRecords[0].completedSaleCount, 2);

    const deterministicCatalog = loadVerifiedCompCatalog(dir);
    assert.deepEqual(deterministicCatalog.map((item) => item.figure), ["Two Sale Figure"]);
    assert.equal(deterministicCatalog[0].completedSaleCount, 2);

    const aiCatalog = buildCatalogSnapshot(dir);
    assert.equal(aiCatalog.length, 1);
    assert.deepEqual(aiCatalog[0].reviewedFigures.map((item) => item.name), ["Two Sale Figure"]);
    assert.equal(aiCatalog[0].reviewedFigures[0].completedSaleCount, 2);
    assert.equal(aiCatalog[0].pendingFigureCount, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown queries fail closed without invented data", () => {
  const response = buildDeterministicCompResponse("character that does not exist", { catalog });
  assert.equal(response.mode, "deterministic");
  assert.equal(response.matches.length, 0);
  assert.match(response.answer, /No verified sale found/i);
});

test("generic natural-language sports-card question never falls through to toy comps", () => {
  const query = "What's the most valuable sports card for this year's releases?";
  const response = buildDeterministicCompResponse(query, { catalog });
  assert.equal(response.mode, "deterministic");
  assert.equal(response.matches.length, 0);
  assert.match(response.answer, /No verified sports-card sale found/i);
});

test("common word 'the' cannot create unrelated collectible matches", () => {
  const results = lookupVerifiedComps("what is the best one", { catalog });
  assert.deepEqual(results, []);
});

test("responses include historical-data disclaimer and no model citations", () => {
  const response = buildDeterministicCompResponse("Tempered Aegis", { catalog });
  assert.equal(response.citations.length, 0);
  assert.ok(response.safetyNotes.some((note) => /not financial or investment advice/i.test(note)));
  assert.equal(response.mode, "deterministic");
});

test("unanswered research questions can queue without a Vercel Supabase key", async () => {
  const previous = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  let captured = null;
  try {
    const result = await recordKnowItAllQuestion({
      question: "Pokemon 30th Celebration Charizard",
      result: { matches: [], confidence: "high" },
      fetchImpl: async (url, init) => {
        captured = { url: String(url), init, payload: JSON.parse(init.body) };
        return { ok: true, json: async () => ({ ok: true, queued: true }) };
      },
    });
    assert.equal(result.stored, true);
    assert.equal(result.queued, true);
    assert.equal(captured.init.headers.authorization, undefined);
    assert.equal(captured.payload.type, "question");
    assert.equal(captured.payload.vertical, "pokemon_tcg");
    assert.equal(captured.payload.answered, false);
    assert.match(captured.url, /mr-know-it-all-ingest$/);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previous;
  }
});
