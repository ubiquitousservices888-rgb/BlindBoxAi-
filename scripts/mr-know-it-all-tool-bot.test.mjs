import assert from "node:assert/strict";
import test from "node:test";

import { cardApiExactTargetMatches } from "../lib/the-card-api.mjs";
import { meaningfulTerms, parseGrade, selectResearchBatch, targetFromQueueItem } from "./mr-know-it-all-tool-bot.mjs";

test("research bot extracts bounded exact-match terms from a collectible question", () => {
  const terms = meaningfulTerms("What is Pokemon 30th Celebration Charizard worth raw and graded?");
  assert.deepEqual(terms, ["30th", "celebration", "charizard"]);
});

test("research bot parses grader and grade without inventing one", () => {
  assert.deepEqual(parseGrade("2026 Topps Example PSA 10 Rookie"), { grader: "PSA", grade: "10" });
  assert.deepEqual(parseGrade("2026 Topps Example raw rookie"), { grader: null, grade: null });
});

test("queue item becomes separate raw and graded strict provider targets", () => {
  const item = {
    queryKey: "a".repeat(64),
    questionRedacted: "Pokemon 30th Celebration Charizard",
  };
  const raw = targetFromQueueItem(item, "raw");
  const graded = targetFromQueueItem(item, "graded");
  assert.equal(raw.identity.condition, "raw");
  assert.equal(graded.identity.condition, "graded");
  assert.equal(raw.limit, 20);
  assert.deepEqual(raw.requiredTitleTerms, ["30th", "celebration", "charizard"]);
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
  const base = { requiredTitleTerms: ["charizard", "30th", "celebration"], requiredTitleAliases: [], identity: {} };
  assert.equal(cardApiExactTargetMatches("Pokemon Charizard 30th Celebration raw", { ...base, identity: { condition: "raw" } }), true);
  assert.equal(cardApiExactTargetMatches("Pokemon Charizard 30th Celebration PSA 10", { ...base, identity: { condition: "raw" } }), false);
});
