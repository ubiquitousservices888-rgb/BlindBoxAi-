import { fetchCardApiSales, summarizeCardApiSales } from "../lib/the-card-api.mjs";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://lazzdoadoqzrzlarerfx.supabase.co").replace(/\/$/, "");
const EDGE_URL = `${SUPABASE_URL}/functions/v1/mr-know-it-all-ingest`;
const OIDC_AUDIENCE = "blindboxai-research-bot";
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
      "user-agent": "BlindBoxAI-MrKnowItAll-ResearchBot/1.0",
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
    limit: 100,
  };
}

async function researchQueueItem(item, oidcToken) {
  if (!CARD_VERTICALS.has(item.vertical)) {
    await edgeCall("bot_finish", {
      queueId: item.id,
      status: "blocked",
      note: "No approved completed-sale provider is configured for this collectible vertical yet.",
      retryHours: 24,
    }, { oidcToken });
    return { id: item.id, outcome: "blocked_no_provider" };
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
    retryHours: verified ? 24 : 6,
  }, { oidcToken });
  return { id: item.id, outcome: verified ? "verified" : "insufficient_evidence", raw: rawSummary, graded: gradedSummary };
}

async function seedRepeater(oidcToken) {
  const seeds = [
    { question: "Pokemon 30th Celebration Charizard", vertical: "pokemon_tcg", priority: 98 },
    { question: "Pokemon 30th Celebration Mewtwo Futuristic rare", vertical: "pokemon_tcg", priority: 97 },
    { question: "Pokemon 30th Celebration Mew Futuristic rare", vertical: "pokemon_tcg", priority: 97 },
    { question: "Pokemon 30th Celebration Umbreon illustration rare", vertical: "pokemon_tcg", priority: 96 },
    { question: "Pokemon 30th Celebration Espeon illustration rare", vertical: "pokemon_tcg", priority: 96 },
    { question: "2026 Topps baseball rookie card", vertical: "sports_cards", priority: 84 },
    { question: "Magic the Gathering Black Lotus", vertical: "magic_the_gathering", priority: 75 },
    { question: "Labubu Macaron", vertical: "pop_mart", priority: 70 },
  ];
  const utcDay = new Date().getUTCDate();
  const selected = [seeds[utcDay % seeds.length], seeds[(utcDay + 3) % seeds.length], seeds[(utcDay + 5) % seeds.length]];
  return edgeCall("bot_seed", { seeds: selected }, { oidcToken });
}

async function main() {
  const oidcToken = await getGithubOidcToken();
  const seedResult = await seedRepeater(oidcToken);
  const pull = await edgeCall("bot_pull", { limit: 5 }, { oidcToken });
  const items = Array.isArray(pull?.items) ? pull.items : [];
  const results = [];
  for (const item of items) results.push(await researchQueueItem(item, oidcToken));
  console.log(JSON.stringify({ seeded: seedResult?.seeded ?? 0, pulled: items.length, results }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export { meaningfulTerms, parseGrade, targetFromQueueItem };
