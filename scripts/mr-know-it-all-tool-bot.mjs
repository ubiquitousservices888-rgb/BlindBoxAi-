import crypto from "node:crypto";
import { readFileSync } from "node:fs";

import { fetchCardApiSales, summarizeCardApiSales } from "../lib/the-card-api.mjs";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://lazzdoadoqzrzlarerfx.supabase.co").replace(/\/$/, "");
const EDGE_URL = `${SUPABASE_URL}/functions/v1/mr-know-it-all-ingest`;
const OIDC_AUDIENCE = "blindboxai-research-bot";
const BATCH_SIZE = Math.min(100, Math.max(1, Number(process.env.RESEARCH_BATCH_SIZE) || 25));
const CONCURRENCY = Math.min(10, Math.max(1, Number(process.env.RESEARCH_CONCURRENCY) || 5));
const SALES_LIMIT_PER_CONDITION = Math.min(50, Math.max(1, Number(process.env.SALES_LIMIT_PER_CONDITION) || 20));
const CARD_VERTICALS = new Set([
  "pokemon_tcg",
  "magic_the_gathering",
  "sports_cards",
  "yugioh",
  "one_piece",
  "disney_lorcana",
  "other_collectible_card",
]);
const STOPWORDS = new Set([
  "what", "is", "are", "the", "a", "an", "and", "of", "for", "this", "that", "card", "cards", "worth",
  "value", "price", "sold", "sale", "sales", "raw", "graded", "pokemon", "pokémon", "tcg", "ccg",
]);

const questionBank = JSON.parse(
  readFileSync(new URL("../data/know-it-all/research-question-bank.json", import.meta.url), "utf8"),
);

function clean(value, max = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function meaningfulTerms(question) {
  const tokens = clean(question)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9#/-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  return [...new Set(tokens)].slice(0, 8);
}

function parseGrade(title) {
  const value = clean(title, 300);
  const match = value.match(/\b(PSA|BGS|SGC|CGC)\s*(10|9(?:\.5)?|8(?:\.5)?|7(?:\.5)?)\b/i);
  return match ? { grader: match[1].toUpperCase(), grade: match[2] } : { grader: null, grade: null };
}

function selectionSalt(now = new Date()) {
  return `${now.toISOString().slice(0, 10)}:${process.env.GITHUB_RUN_NUMBER || "local"}`;
}

function selectResearchBatch(items, count = BATCH_SIZE, salt = selectionSalt()) {
  const unique = [...new Map((Array.isArray(items) ? items : []).map((item) => [clean(item?.question).toLowerCase(), item])).values()]
    .filter((item) => clean(item?.question).length >= 4 && clean(item?.vertical).length > 0);
  return unique
    .map((item) => ({
      ...item,
      _rank: crypto.createHash("sha256").update(`${salt}:${clean(item.question).toLowerCase()}`).digest("hex"),
    }))
    .sort((a, b) => a._rank.localeCompare(b._rank))
    .slice(0, Math.min(count, unique.length))
    .map(({ _rank, ...item }) => item);
}

async function getGithubOidcToken(fetchImpl = fetch) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error("GitHub OIDC environment is unavailable");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", OIDC_AUDIENCE);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload?.value) throw new Error("GitHub OIDC token response was empty");
  return payload.value;
}

async function edgeCall(type, body = {}, { oidcToken, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(EDGE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidcToken}`,
      "content-type": "application/json",
      "user-agent": "BlindBoxAI-MrKnowItAll-ResearchBot/2.1",
    },
    body: JSON.stringify({ type, ...body }),
    redirect: "error",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${type} failed: ${response.status} ${payload?.error || ""}`.trim());
  return payload;
}

function targetFromQueueItem(item, condition) {
  const question = clean(item?.questionRedacted, 180);
  const terms = meaningfulTerms(question);
  if (terms.length < 2) return null;
  return {
    id: clean(item?.queryKey, 128),
    query: question,
    requiredTitleTerms: terms,
    requiredTitleAliases: [],
    identity: { condition },
    limit: SALES_LIMIT_PER_CONDITION,
  };
}

async function researchQueueItem(item, oidcToken) {
  if (!CARD_VERTICALS.has(item.vertical)) {
    await edgeCall("bot_finish", {
      queueId: item.id,
      status: "blocked",
      note: "Catalog target recorded, but no approved completed-sale provider is configured for this collectible vertical yet.",
      retryHours: 24,
      result: { catalogTarget: true, soldEvidence: false },
    }, { oidcToken });
    return { id: item.id, outcome: "cataloged_waiting_for_provider" };
  }

  if (!String(process.env.THE_CARD_API_KEY || "").trim()) {
    await edgeCall("bot_finish", {
      queueId: item.id,
      status: "queued",
      note: "The Card API credential is not configured; retry retained without fabricating value evidence.",
      retryHours: 6,
    }, { oidcToken });
    return { id: item.id, outcome: "waiting_for_card_api" };
  }

  const accepted = [];
  for (const condition of ["raw", "graded"]) {
    const target = targetFromQueueItem(item, condition);
    if (!target) continue;
    const provider = await fetchCardApiSales(target);
    if (provider.status !== "ok") continue;
    for (const sale of provider.records) {
      const grade = condition === "graded" ? parseGrade(sale.title) : { grader: null, grade: null };
      const saved = await edgeCall("bot_sold_observation", {
        queryKey: item.queryKey,
        sourcePlatform: clean(sale.source || "the_card_api", 80),
        sourceRecordId: clean(sale.providerRecordId || sale.sourceUrl, 160),
        sourceUrl: sale.sourceUrl,
        amount: sale.amount,
        soldAt: sale.soldAt,
        conditionType: condition,
        grader: grade.grader,
        grade: grade.grade,
        saleType: sale.listingType,
        exactMatch: true,
        verified: true,
      }, { oidcToken });
      if (saved.ok) accepted.push({ ...sale, conditionType: condition, ...grade });
    }
  }

  const rawSummary = summarizeCardApiSales(accepted.filter((sale) => sale.conditionType === "raw"));
  const gradedSummary = summarizeCardApiSales(accepted.filter((sale) => sale.conditionType === "graded"));
  const verified = rawSummary.status === "VERIFIED" || gradedSummary.status === "VERIFIED";
  await edgeCall("bot_finish", {
    queueId: item.id,
    status: verified ? "verified" : "queued",
    note: verified
      ? `Verified completed-sale evidence stored. raw=${rawSummary.soldSampleCount}, graded=${gradedSummary.soldSampleCount}`
      : `Insufficient exact completed-sale evidence. raw=${rawSummary.soldSampleCount}, graded=${gradedSummary.soldSampleCount}`,
    retryHours: 6,
    result: { raw: rawSummary, graded: gradedSummary },
  }, { oidcToken });
  return { id: item.id, outcome: verified ? "verified" : "insufficient_evidence", raw: rawSummary, graded: gradedSummary };
}

async function seedRepeater(oidcToken) {
  const selected = selectResearchBatch(questionBank?.items, BATCH_SIZE);
  return edgeCall("bot_seed", { seeds: selected }, { oidcToken });
}

async function runBounded(items, oidcToken) {
  const results = [];
  for (let offset = 0; offset < items.length; offset += CONCURRENCY) {
    const chunk = items.slice(offset, offset + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((item) => researchQueueItem(item, oidcToken)));
    settled.forEach((entry, index) => {
      results.push(entry.status === "fulfilled"
        ? entry.value
        : { id: chunk[index]?.id, outcome: "worker_error", error: clean(entry.reason?.message || entry.reason, 240) });
    });
  }
  return results;
}

async function main() {
  const oidcToken = await getGithubOidcToken();
  const seedResult = await seedRepeater(oidcToken);
  const pull = await edgeCall("bot_pull", { limit: BATCH_SIZE }, { oidcToken });
  const items = Array.isArray(pull?.items) ? pull.items : [];
  const results = await runBounded(items, oidcToken);
  console.log(JSON.stringify({
    questionBankSize: Array.isArray(questionBank?.items) ? questionBank.items.length : 0,
    requestedBatchSize: BATCH_SIZE,
    salesLimitPerCondition: SALES_LIMIT_PER_CONDITION,
    seeded: seedResult?.seeded ?? 0,
    pulled: items.length,
    results,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export { meaningfulTerms, parseGrade, selectResearchBatch, targetFromQueueItem };