import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { cardApiExactTargetMatches } from "../lib/the-card-api.mjs";
import {
  buildProviderQuery,
  identityTerms,
  meaningfulTerms,
  parseGrade,
  selectResearchBatch,
  targetFromQueueItem,
} from "./mr-know-it-all-tool-bot.mjs";

test("research bot extracts bounded exact-match terms from a collectible question", () => {
  const terms = meaningfulTerms("What is Pokemon 30th Celebration Charizard worth raw and graded?");
  assert.deepEqual(terms, ["30th", "celebration", "charizard"]);
});

test("vertical boilerplate is removed before strict collectible matching", () => {
  assert.deepEqual(
    identityTerms("Magic the Gathering Black Lotus Alpha", "magic_the_gathering"),
    ["black", "lotus", "alpha"],
  );
  assert.deepEqual(
    identityTerms("One Piece Card Game Shanks manga rare", "one_piece"),
    ["shanks", "manga", "rare"],
  );
});

test("provider query is broader than final strict identity", () => {
  assert.equal(buildProviderQuery(["30th", "celebration", "charizard"]), "30th charizard");
  assert.equal(buildProviderQuery(["2018", "panini", "prizm", "luka", "doncic", "280"]), "2018 panini doncic 280");
});

test("research bot parses grader and grade without inventing one", () => {
  assert.deepEqual(parseGrade("2026 Topps Example PSA 10 Rookie"), { grader: "PSA", grade: "10" });
  assert.deepEqual(parseGrade("2026 Topps Example raw rookie"), { grader: null, grade: null });
});

test("queue item becomes separate raw and graded strict targets sharing one broad provider query", () => {
  const item = {
    queryKey: "a".repeat(64),
    questionRedacted: "Pokemon 30th Celebration Charizard",
    vertical: "pokemon_tcg",
  };
  const raw = targetFromQueueItem(item, "raw");
  const graded = targetFromQueueItem(item, "graded");
  assert.equal(raw.identity.condition, "raw");
  assert.equal(graded.identity.condition, "graded");
  assert.equal(raw.limit, 20);
  assert.equal(raw.providerQuery, "30th charizard");
  assert.equal(graded.providerQuery, raw.providerQuery);
  assert.deepEqual(raw.requiredTitleTerms, ["30th", "charizard"]);
  assert.deepEqual(raw.requiredTitleAliases, [["celebration", "celebrations"]]);
});

test("100-question selector is deterministic per run and contains no duplicates", () => {
  const items = Array.from({ length: 140 }, (_, index) => ({
    question: `Collectible target ${index}`,
    vertical: index % 2 ? "sports_cards" : "other_collectible_toy",
    priority: 50,
  }));
  const first = selectResearchBatch(items, 100, "test-run");
  const second = selectResearchBatch(items, 100, "test-run");
  assert.equal(first.length, 100);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((item) => item.question)).size, 100);
});

test("card matcher never mixes graded sale into a raw target", () => {
  const base = {
    requiredTitleTerms: ["charizard", "30th"],
    requiredTitleAliases: [["celebration", "celebrations"]],
    identity: {},
  };
  assert.equal(cardApiExactTargetMatches("Pokemon Charizard 30th Celebrations raw", { ...base, identity: { condition: "raw" } }), true);
  assert.equal(cardApiExactTargetMatches("Pokemon Charizard 30th Celebration PSA 10", { ...base, identity: { condition: "raw" } }), false);
});


test("research queue controls bound backlog, reserve public capacity, drain orphans, and allow 30-day cooldowns", () => {
  const edgeSource = fs.readFileSync(
    new URL("../supabase/functions/mr-know-it-all-ingest/index.ts", import.meta.url),
    "utf8",
  );
  const workerSource = fs.readFileSync(
    new URL("./mr-know-it-all-tool-bot.mjs", import.meta.url),
    "utf8",
  );

  assert.match(edgeSource, /eligibleAutomaticBacklog/);
  assert.match(edgeSource, /reason", "unanswered_public_question"/);
  assert.match(edgeSource, /status: "dismissed"/);
  assert.match(edgeSource, /Math\.min\(720,/);
  assert.match(workerSource, /successfulEmptyCooldown/);
  assert.match(workerSource, /accepted\.length === 0/);
  assert.match(workerSource, /retryHours: successfulEmptyCooldown \? 720 : 6/);
});
