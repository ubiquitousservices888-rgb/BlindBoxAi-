import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  assert.match(workerSource, /insufficientIdentityCooldown/);
  assert.ok(workerSource.includes("Number(item?.attempts || 0) >= 8"), "eight-attempt cooldown threshold must remain enforced");
  assert.match(workerSource, /retryHours: insufficientIdentityCooldown \? 720 : 24/);
  assert.match(workerSource, /accepted\.length === 0/);
  assert.match(workerSource, /retryHours: successfulEmptyCooldown \? 720 : 6/);
});


const mockNetwork = `
const respond = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith("https://oidc.example.test/")) return respond(200, { value: "mock-token" });
  if (!String(url).includes("/functions/v1/mr-know-it-all-ingest")) throw new Error("Unexpected request URL");
  const request = JSON.parse(options.body || "{}");
  if (request.type === "bot_seed") return respond(200, { seeded: 1 });
  if (request.type === "bot_pull") return respond(200, { items: [{ id: "test-item", vertical: "other_collectible_toy" }] });
  if (request.type === "bot_finish") return process.env.MOCK_FINISH_FAIL === "1"
    ? respond(403, { error: "permission denied" })
    : respond(200, { ok: true });
  throw new Error("Unexpected request type: " + request.type);
};
`;

function runMockedScheduledBot(failFinish) {
  const script = fileURLToPath(new URL("./mr-know-it-all-tool-bot.mjs", import.meta.url));
  const preload = "data:text/javascript," + encodeURIComponent(mockNetwork);
  const child = spawnSync(process.execPath, ["--import", preload, script], {
    encoding: "utf8",
    timeout: 15000,
    env: {
      PATH: process.env.PATH || "",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example.test/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "mock-request-token",
      RESEARCH_BATCH_SIZE: "1",
      MOCK_FINISH_FAIL: failFinish ? "1" : "0",
    },
  });
  assert.equal(child.error, undefined, child.stderr);
  assert.equal(child.signal, null, child.stderr);
  return child;
}

test("scheduled worker reports per-row errors and exits nonzero after printing its summary", () => {
  const child = runMockedScheduledBot(true);
  assert.equal(child.status, 1, child.stderr);
  const summary = JSON.parse(child.stdout);
  assert.equal(summary.pulled, 1);
  assert.equal(summary.workerErrors, 1);
  assert.equal(summary.results.length, 1);
  assert.equal(summary.results[0].outcome, "worker_error");
  assert.match(summary.results[0].error, /bot_finish failed: 403/);
});

test("scheduled worker completes successfully when mocked queue items finish", () => {
  const child = runMockedScheduledBot(false);
  assert.equal(child.status, 0, child.stderr);
  const summary = JSON.parse(child.stdout);
  assert.equal(summary.workerErrors, 0);
  assert.equal(summary.results.length, 1);
  assert.equal(summary.results[0].outcome, "cataloged_waiting_for_provider");
});
