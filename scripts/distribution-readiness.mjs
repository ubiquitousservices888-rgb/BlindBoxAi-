import fs from "node:fs/promises";
import path from "node:path";

import { evaluateAffiliateEligibility, PUBLIC_PRICE_FRESHNESS_DAYS } from "../lib/market-eligibility.mjs";

const ROOT = process.cwd();
const PLAN_PATH = path.join(ROOT, "data", "distribution", "launch-plan.json");
const SERIES_DIR = path.join(ROOT, "data", "series");
const VERIFICATION_PATH = path.join(ROOT, "data", "know-it-all", "latest-transaction-verification.json");
const OUT_PATH = path.join(ROOT, "data", "distribution", "latest-readiness.json");

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function trackedSeries(plan) {
  return [...(plan.featuredSeries ?? []), ...(plan.candidateSeries ?? [])]
    .filter((item) => item?.slug)
    .map((item) => ({
      slug: String(item.slug),
      priority: Number(item.priority) || 999,
      plannedStatus: String(item.status ?? "unknown"),
    }))
    .sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug));
}

function latestDate(records) {
  return records.map((record) => record.latestSaleAt).filter(Boolean).sort().at(-1) ?? null;
}

function seriesState(series, planItem, now) {
  if (!series) {
    return {
      ...planItem,
      exists: false,
      status: "missing-series-data",
      verifiedRecordCount: 0,
      freshRecordCount: 0,
      datedRecordCount: 0,
      latestSaleAt: null,
      trafficReady: false,
    };
  }

  const eligibility = evaluateAffiliateEligibility(series, { now });
  const records = eligibility.verifiedMarketRecords ?? [];
  const fresh = records.filter((record) => record.freshnessStatus === "fresh");
  const dated = records.filter((record) => record.freshnessStatus === "dated");
  const unknown = records.filter((record) => record.freshnessStatus === "unknown");
  return {
    ...planItem,
    exists: true,
    name: String(series.name ?? planItem.slug),
    brand: String(series.brand ?? ""),
    status: fresh.length > 0 ? "fresh-evidence-available" : records.length > 0 ? "verified-but-not-fresh" : "no-verified-price-evidence",
    verifiedRecordCount: records.length,
    freshRecordCount: fresh.length,
    datedRecordCount: dated.length,
    unknownFreshnessCount: unknown.length,
    documentedSaleCount: records.reduce((total, record) => total + (Number(record.completedSaleCount) || 0), 0),
    latestSaleAt: latestDate(records),
    trafficReady: fresh.length > 0,
  };
}

const plan = await readJson(PLAN_PATH);
if (!plan) throw new Error("Distribution launch plan is missing");

const now = new Date(process.env.DISTRIBUTION_NOW || Date.now());
if (!Number.isFinite(now.getTime())) throw new Error("DISTRIBUTION_NOW is invalid");

const seriesFiles = (await fs.readdir(SERIES_DIR)).filter((name) => name.endsWith(".json") && !name.startsWith("_"));
const seriesBySlug = new Map();
for (const file of seriesFiles) {
  const series = await readJson(path.join(SERIES_DIR, file));
  if (series?.slug) seriesBySlug.set(String(series.slug), series);
}

const states = trackedSeries(plan).map((item) => seriesState(seriesBySlug.get(item.slug), item, now));
const minimumFreshFeaturedSeries = Number(plan?.trafficGate?.minimumFreshFeaturedSeries) || 2;
const freshSeriesCount = states.filter((item) => item.trafficReady).length;
const verification = await readJson(VERIFICATION_PATH, {});
const confirmedResearchTargets = Array.isArray(verification?.findings)
  ? verification.findings.filter((item) => item?.verification === "confirmed-by-public-sales-history").length
  : 0;

const trafficReady = freshSeriesCount >= minimumFreshFeaturedSeries;
const artifact = {
  schema: "blindboxai/distribution-readiness/v1",
  generatedAt: now.toISOString(),
  freshnessWindowDays: PUBLIC_PRICE_FRESHNESS_DAYS,
  measurementWindowDays: Number(plan.measurementWindowDays) || 14,
  baseline: plan.baseline,
  primaryKpis: plan.primaryKpis,
  gate: {
    trafficReady,
    minimumFreshFeaturedSeries,
    freshSeriesCount,
    reason: trafficReady
      ? "Fresh completed-sale evidence exists for enough featured/candidate series to begin the measured distribution test."
      : `Need ${Math.max(0, minimumFreshFeaturedSeries - freshSeriesCount)} more series with fresh verified completed-sale evidence before traffic promotion.`,
  },
  research: {
    latestVerificationResearchedAt: verification?.researchedAt ?? null,
    confirmedResearchTargets,
  },
  series: states,
  distributionRules: plan.distributionRules,
};

await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
await fs.writeFile(OUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Distribution gate: ${trafficReady ? "READY" : "BLOCKED"}; ${freshSeriesCount}/${minimumFreshFeaturedSeries} series have fresh verified evidence.`);
