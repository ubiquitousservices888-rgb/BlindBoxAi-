import crypto from "node:crypto";
import { readFileSync } from "node:fs";

import { cardApiExactTargetMatches, fetchCardApiSales, summarizeCardApiSales } from "../lib/the-card-api.mjs";

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
const VERTICAL_GENERIC_TERMS = new Map([
  ["magic_the_gathering", new Set(["magic", "gathering"])],
  ["yugioh", new Set(["yu-gi-oh", "yugioh"])],
  ["one_piece", new Set(["one", "piece", "game"])],
  ["disney_lorcana", new Set(["disney", "lorcana"])],
]);
const TERM_ALIASES = new Map([
  ["rookie", ["rookie", "rc"]],
  ["autograph", ["autograph", "auto"]],
  ["celebration", ["celebration", "celebrations"]],
  ["1st", ["1st", "first"]],
]);
const PROVIDER_LOW_SIGNAL = new Set([
  "rare", "illustration", "enchanted", "rookie", "autograph", "celebration", "edition", "refractor", "shadowless",
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
  return [...new Set(tokens)].slice(0, 10);
}

function identityTerms(question, vertical) {
  const generic = VERTICAL_GENERIC_TERMS.get(clean(vertical, 60)) || new Set();
  return meaningfulTerms(question).filter((term) => !generic.has(term));
}

function splitStrictIdentity(terms) {
  const requiredTitleTerms = [];
  const requiredTitleAliases = [];
  for (const term of terms) {
    const aliases = TERM_ALIASES.get(term);
    if (aliases) requiredTitleAliases.push(aliases);
    else requiredTitleTerms.push(term);
  }
  return { requiredTitleTerms, requiredTitleAliases };
}

function buildProviderQuery(terms) {
  const highSignal = terms.filter((term) => !PROVIDER_LOW_SIGNAL.has(term));
  const source = highSignal.length >= 2 ? highSignal : terms;
  if (source.length <= 4) return source.join(" ");

  // Prefer names, years and card numbers while keeping their original order.
  const ranked = source.map((term, index) => ({
    term,
    index,
    score: (/\d/.test(term) ? 4 : 0) + (term.includes("/") || term.includes("-") ? 3 : 0) + Math.min(term.length, 10) / 10,
  }));
  const selected = ranked.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4).sort((a, b) => a.index - b.index);
  return selected.map((entry) => entry.term).join(" ");
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
      "user-agent": "BlindBoxAI-MrKnowItAll-ResearchBot/2.2",
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
  const terms = identityTerms(question, item?.vertical);
  const strict = splitStrictIdentity(terms);
  const constraintCount = strict.requiredTitleTerms.length + strict.requiredTitleAliases.length;
  if (constraintCount < 2) return null;
  return {
    id: clean(item?.queryKey, 128),
    query: question,
    providerQuery: buildProviderQuery(terms),
    requiredTitleTerms: strict.requiredTitleTerms,
    requiredTitleAliases: strict.requiredTitleAliases,
    identity: { condition },
    limit: SALES_LIMIT_PER_CONDITION,
  };
}

async function saveMatchedSales(item, target, records, oidcToken) {
  const accepted = [];
  for (const sale of records) {
    if (!cardApiExactTargetMatches(sale.title, target)) continue;
    const condition = clean(target?.identity?.condition, 20);
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
  return accepted;
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

  const rawTarget = targetFromQueueItem(item, "raw");
  const gradedTarget = targetFromQueueItem(item, "graded");
  if (!rawTarget || !gradedTarget) {
    await edgeCall("bot_finish", {
      queueId: item.id,
      status: "queued",
      note: "Not enough identity terms for safe sold-result matching.",
      retryHours: 24,
      result: { soldEvidence: false, reason: "insufficient_identity" },
    }, { oidcToken });
    return { id: item.id, outcome: "insufficient_identity" };
  }

  // One broad provider request per collectible. Raw/graded are separated only after
  // every returned candidate passes the strict title/identity checks.
  const searchTarget = {
    ...rawTarget,
    identity: { condition: "" },
    limit: Math.min(100, SALES_LIMIT_PER_CONDITION * 2),
  };
  const provider = await fetchCardApiSales(searchTarget);
  const providerInfo = {
    status: provider.status,
    providerQuery: provider.providerQuery || searchTarget.providerQuery,
    returnedCount: provider.returnedCount ?? 0,
    strictIdentityCount: provider.acceptedCount ?? 0,
  };

  if (provider.status !== "ok") {
    await edgeCall("bot_finish", {
      queueId: item.id,
      status: "queued",
      note: `Completed-sale provider did not return usable data (${provider.status}).`,
      retryHours: 6,
      result: { provider: providerInfo, soldEvidence: false },
    }, { oidcToken });
    return { id: item.id, outcome: "provider_unavailable", provider: providerInfo };
  }

  const rawAccepted = await saveMatchedSales(item, rawTarget, provider.records, oidcToken);
  const gradedAccepted = await saveMatchedSales(item, gradedTarget, provider.records, oidcToken);
  const accepted = [...rawAccepted, ...gradedAccepted];

  const rawSummary = summarizeCardApiSales(rawAccepted);
  const gradedSummary = summarizeCardApiSales(gradedAccepted);
  const verified = rawSummary.status === "VERIFIED" || gradedSummary.status === "VERIFIED";
  await edgeCall("bot_finish", {
    queueId: item.id,
    status: verified ? "verified" : "queued",
    note: verified
      ? `Verified completed-sale evidence stored. raw=${rawSummary.soldSampleCount}, graded=${gradedSummary.soldSampleCount}`
      : `Broad sold search returned ${providerInfo.returnedCount}; strict identity kept ${providerInfo.strictIdentityCount}; stored ${accepted.length}.`,
    retryHours: 6,
    result: { provider: providerInfo, raw: rawSummary, graded: gradedSummary },
  }, { oidcToken });
  return {
    id: item.id,
    outcome: verified ? "verified" : "insufficient_evidence",
    provider: providerInfo,
    raw: rawSummary,
    graded: gradedSummary,
  };
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

export { buildProviderQuery, identityTerms, meaningfulTerms, parseGrade, selectResearchBatch, targetFromQueueItem };
