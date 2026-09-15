import fs from "node:fs";
import path from "node:path";

import { evaluateAffiliateEligibility, PUBLIC_PRICE_FRESHNESS_DAYS } from "./market-eligibility.mjs";

const DISCLAIMER = "Historical observed resale data only. Not financial or investment advice. Past sales do not guarantee future prices.";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "cost", "for", "from", "how", "i", "in", "is", "it",
  "most", "of", "on", "or", "price", "prices", "release", "releases", "sports", "card", "cards", "that", "the", "this", "to",
  "value", "valuable", "was", "what", "whats", "when", "where", "which", "who", "why", "with", "worth", "year", "years",
]);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function queryTokens(value) {
  return [...new Set(tokens(value).filter((token) => token.length >= 2 && !STOPWORDS.has(token)))];
}

function tokenSet(value) {
  return new Set(tokens(value));
}

function isSportsCardIntent(value) {
  return /\b(?:sports? cards?|baseball cards?|basketball cards?|football cards?|hockey cards?|rookie cards?|topps|panini|bowman)\b/i.test(String(value ?? ""));
}

function humanDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function loadVerifiedCompCatalog(seriesDirectory = path.join(process.cwd(), "data", "series"), { now = new Date() } = {}) {
  if (!fs.existsSync(seriesDirectory)) return [];

  const records = [];
  for (const file of fs.readdirSync(seriesDirectory).filter((name) => name.endsWith(".json") && !name.startsWith("_"))) {
    const series = JSON.parse(fs.readFileSync(path.join(seriesDirectory, file), "utf8"));
    const eligibility = evaluateAffiliateEligibility(series, { now });

    for (const verified of eligibility.verifiedMarketRecords) {
      records.push({
        brand: String(series.brand ?? "").trim(),
        series: String(series.name ?? "").trim(),
        seriesSlug: String(series.slug ?? "").trim(),
        figure: verified.figure,
        rarity: verified.rarity,
        observedLowUSD: verified.resaleLowUSD,
        observedHighUSD: verified.resaleHighUSD,
        evidence: verified.transactionEvidence,
        checklist: Array.isArray(series.checklist) ? series.checklist.map((item) => String(item)) : [],
        completedSaleCount: verified.completedSaleCount,
        latestSaleAt: verified.latestSaleAt,
        ageDays: verified.ageDays,
        freshnessStatus: verified.freshnessStatus,
        freshnessWindowDays: verified.freshnessWindowDays,
        reviewStatus: "reviewed",
      });
    }
  }
  return records.sort((a, b) => `${a.series} ${a.figure}`.localeCompare(`${b.series} ${b.figure}`));
}

function scoreRecord(record, query) {
  const normalizedQuery = normalize(query);
  const meaningfulTokens = queryTokens(query);
  if (!normalizedQuery || meaningfulTokens.length === 0) return 0;

  const figure = normalize(record.figure);
  const series = normalize(record.series);
  const brand = normalize(record.brand);
  const haystack = `${brand} ${series} ${figure}`;
  const figureTokens = tokenSet(record.figure);
  const seriesTokens = tokenSet(record.series);
  const brandTokens = tokenSet(record.brand);

  let score = 0;
  let matchedTokens = 0;
  if (figure === normalizedQuery) score += 100;
  if (series === normalizedQuery) score += 70;
  if (haystack.includes(normalizedQuery)) score += 35;
  for (const token of meaningfulTokens) {
    if (figureTokens.has(token)) {
      score += 12;
      matchedTokens += 1;
    } else if (seriesTokens.has(token)) {
      score += 7;
      matchedTokens += 1;
    } else if (brandTokens.has(token)) {
      score += 3;
      matchedTokens += 1;
    }
  }

  const exactOrContained = figure === normalizedQuery || series === normalizedQuery || haystack.includes(normalizedQuery);
  const allMeaningfulTokensMatch = matchedTokens === meaningfulTokens.length;
  return exactOrContained || allMeaningfulTokensMatch ? score : 0;
}

function normalizedIdentity(value) {
  const meaningful = queryTokens(value);
  return meaningful.length ? meaningful.join(" ") : normalize(value);
}

function levenshtein(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      const substitution = diagonal + (left[i - 1] === right[j - 1] ? 0 : 1);
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, substitution);
      diagonal = above;
    }
  }
  return previous[right.length];
}

function similarity(a, b) {
  const left = normalizedIdentity(a);
  const right = normalizedIdentity(b);
  const maxLength = Math.max(left.length, right.length);
  if (!maxLength) return 0;
  return 1 - (levenshtein(left, right) / maxLength);
}

export function lookupVerifiedComps(query, { catalog, limit = 12, seriesDirectory, now = new Date() } = {}) {
  const clean = String(query ?? "").trim().slice(0, 120);
  if (clean.length < 2) return [];
  const source = catalog ?? loadVerifiedCompCatalog(seriesDirectory, { now });
  return source
    .map((record) => ({ record, score: scoreRecord(record, clean) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.record.figure.localeCompare(b.record.figure))
    .slice(0, Math.max(1, Math.min(limit, 25)))
    .map(({ record }) => record);
}

export function findNearestVerifiedMatch(query, { catalog, seriesDirectory, now = new Date() } = {}) {
  const clean = String(query ?? "").trim().slice(0, 120);
  const identity = normalizedIdentity(clean);
  if (identity.length < 4) return null;
  const source = catalog ?? loadVerifiedCompCatalog(seriesDirectory, { now });
  const ranked = source
    .map((record) => ({
      record,
      score: Math.max(similarity(clean, record.figure), similarity(clean, record.series) * 0.92),
    }))
    .sort((a, b) => b.score - a.score || a.record.figure.localeCompare(b.record.figure));
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < 0.72) return null;
  if (second && top.score < 0.9 && top.score - second.score < 0.06) return null;
  return {
    figure: top.record.figure,
    series: top.record.series,
    seriesSlug: top.record.seriesSlug,
    brand: top.record.brand,
    similarity: Math.round(top.score * 100) / 100,
  };
}

function freshnessAnswer(record, range) {
  const count = Number(record.completedSaleCount) || 0;
  const date = humanDate(record.latestSaleAt);
  if (record.freshnessStatus === "fresh") {
    return `${record.figure} from ${record.series} has verified completed-sale evidence of ${range} from ${count} completed sales. Latest documented sale: ${date}.`;
  }
  if (record.freshnessStatus === "dated") {
    return `${record.figure} from ${record.series} has verified historical completed-sale evidence of ${range} from ${count} completed sales. Latest documented sale: ${date}; this price evidence is dated because it is older than ${record.freshnessWindowDays ?? PUBLIC_PRICE_FRESHNESS_DAYS} days.`;
  }
  return `${record.figure} from ${record.series} has verified historical completed-sale evidence of ${range} from ${count} completed sales, but the latest sale date could not be verified, so price freshness is unknown.`;
}

export function buildDeterministicCompResponse(query, options = {}) {
  const now = options.now ?? new Date();
  const matches = lookupVerifiedComps(query, { ...options, now });
  if (matches.length === 0) {
    const sportsCard = isSportsCardIntent(query);
    const suggestedMatch = sportsCard ? null : findNearestVerifiedMatch(query, { ...options, now });
    const baseMessage = sportsCard
      ? "No verified sports-card sale found in the reviewed BlindBoxAI dataset for that search."
      : "No verified sale found in the reviewed BlindBoxAI dataset for that exact search.";
    return {
      answer: suggestedMatch
        ? `${baseMessage} Did you mean ${suggestedMatch.figure} from ${suggestedMatch.series}? Confirm that exact item before BlindBoxAI shows its price evidence.`
        : baseMessage,
      confidence: "high",
      currentAsOf: null,
      citations: [],
      safetyNotes: [DISCLAIMER, "Only reviewed records are returned. Pending, unrelated, or single-sale records are excluded. Near matches never substitute a price without confirmation."],
      suggestedQuestions: [],
      suggestedMatch,
      matches: [],
      mode: "deterministic",
    };
  }

  const top = matches[0];
  const range = top.observedLowUSD === top.observedHighUSD
    ? `$${top.observedLowUSD.toFixed(2)}`
    : `$${top.observedLowUSD.toFixed(2)}–$${top.observedHighUSD.toFixed(2)}`;
  const freshnessStatus = top.freshnessStatus ?? "unknown";
  const confidence = freshnessStatus === "fresh" ? "high" : freshnessStatus === "dated" ? "medium" : "low";
  const freshnessNote = freshnessStatus === "fresh"
    ? `Fresh means the latest documented sale is within ${top.freshnessWindowDays ?? PUBLIC_PRICE_FRESHNESS_DAYS} days.`
    : freshnessStatus === "dated"
      ? `This is verified historical evidence, not a current-price claim; the latest documented sale is older than ${top.freshnessWindowDays ?? PUBLIC_PRICE_FRESHNESS_DAYS} days.`
      : "This is verified historical evidence, but sale-date freshness could not be established.";

  return {
    answer: freshnessAnswer(top, range),
    confidence,
    currentAsOf: top.latestSaleAt ? `${top.latestSaleAt}T00:00:00.000Z` : null,
    citations: [],
    safetyNotes: [DISCLAIMER, "Verified means at least two documented completed sales.", freshnessNote, "Only reviewed local records are used. No generative AI or external model is called."],
    suggestedQuestions: [],
    suggestedMatch: null,
    matches,
    mode: "deterministic",
  };
}
