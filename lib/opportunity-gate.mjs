export const OPPORTUNITY_EVENT_SCHEMA = "blindboxai.opportunity-event/v1";
export const OPPORTUNITY_DECISION_SCHEMA = "blindboxai.opportunity-decision/v1";
export const DEFAULT_PUBLISH_THRESHOLD = 65;

const RAW_EBAY_LISTING = /https?:\/\/(?:www\.)?ebay\.[^\s/]+\/itm\//i;

function finiteNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}`);
  }
  return number;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const text = value.trim();
  if (RAW_EBAY_LISTING.test(text)) throw new Error(`${label} must not contain a raw eBay listing URL`);
  return text;
}

function isoDate(value, label) {
  const text = nonEmptyString(value, label);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw new Error(`${label} must be an ISO-compatible date`);
  return new Date(time);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function assertNoRawListingUrls(value, path = "event") {
  if (typeof value === "string") {
    if (RAW_EBAY_LISTING.test(value)) throw new Error(`${path} must not contain a raw eBay listing URL`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawListingUrls(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) assertNoRawListingUrls(item, `${path}.${key}`);
  }
}

export function validateOpportunityEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("event must be an object");
  assertNoRawListingUrls(event);
  if (event.schema !== OPPORTUNITY_EVENT_SCHEMA) throw new Error(`event.schema must equal ${OPPORTUNITY_EVENT_SCHEMA}`);
  nonEmptyString(event.productId, "event.productId");
  nonEmptyString(event.brand, "event.brand");
  nonEmptyString(event.seriesName, "event.seriesName");
  isoDate(event.observedAt, "event.observedAt");

  const sold = event.soldEvidence;
  if (!sold || typeof sold !== "object") throw new Error("event.soldEvidence is required");
  finiteNumber(sold.count, "event.soldEvidence.count", { min: 0, max: 100000 });
  finiteNumber(sold.windowDays, "event.soldEvidence.windowDays", { min: 1, max: 365 });
  finiteNumber(sold.medianUSD, "event.soldEvidence.medianUSD", { min: 0, max: 1000000 });
  if (sold.sourceReviewed !== true) throw new Error("event.soldEvidence.sourceReviewed must be true");
  isoDate(sold.checkedAt, "event.soldEvidence.checkedAt");
  nonEmptyString(sold.sourceLabel, "event.soldEvidence.sourceLabel");

  const active = event.activeSupply;
  if (!active || typeof active !== "object") throw new Error("event.activeSupply is required");
  finiteNumber(active.count, "event.activeSupply.count", { min: 0, max: 100000 });
  finiteNumber(active.medianAskUSD, "event.activeSupply.medianAskUSD", { min: 0, max: 1000000 });
  isoDate(active.checkedAt, "event.activeSupply.checkedAt");
  nonEmptyString(active.sourceLabel, "event.activeSupply.sourceLabel");

  const demand = event.privateDemand ?? {};
  finiteNumber(demand.repeatedQuestions ?? 0, "event.privateDemand.repeatedQuestions", { min: 0, max: 10000 });

  const campaign = event.campaignHistory ?? {};
  finiteNumber(campaign.impressions ?? 0, "event.campaignHistory.impressions", { min: 0, max: 1000000000 });
  finiteNumber(campaign.clicks ?? 0, "event.campaignHistory.clicks", { min: 0, max: 1000000000 });
  finiteNumber(campaign.conversions ?? 0, "event.campaignHistory.conversions", { min: 0, max: 1000000000 });
  if ((campaign.clicks ?? 0) > (campaign.impressions ?? 0)) throw new Error("campaign clicks cannot exceed impressions");
  if ((campaign.conversions ?? 0) > (campaign.clicks ?? 0)) throw new Error("campaign conversions cannot exceed clicks");

  return true;
}

export function scoreOpportunity(event, { now = new Date(), publishThreshold = DEFAULT_PUBLISH_THRESHOLD } = {}) {
  validateOpportunityEvent(event);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new Error("now must be a valid date");
  const threshold = finiteNumber(publishThreshold, "publishThreshold", { min: 0, max: 100 });

  const observedAt = new Date(event.observedAt);
  const soldCheckedAt = new Date(event.soldEvidence.checkedAt);
  const activeCheckedAt = new Date(event.activeSupply.checkedAt);
  const freshestRequiredEvidence = Math.min(observedAt.getTime(), soldCheckedAt.getTime(), activeCheckedAt.getTime());
  const ageHours = Math.max(0, (nowDate.getTime() - freshestRequiredEvidence) / 3_600_000);

  const soldCount = Number(event.soldEvidence.count);
  const activeCount = Number(event.activeSupply.count);
  const repeatedQuestions = Number(event.privateDemand?.repeatedQuestions ?? 0);
  const impressions = Number(event.campaignHistory?.impressions ?? 0);
  const clicks = Number(event.campaignHistory?.clicks ?? 0);
  const conversions = Number(event.campaignHistory?.conversions ?? 0);

  const evidenceQuality = 25;
  const freshness = ageHours <= 24 ? 15 : ageHours <= 72 ? 10 : ageHours <= 168 ? 5 : 0;
  const normalizedMonthlySold = soldCount * (30 / Number(event.soldEvidence.windowDays));
  const marketActivity = round1(clamp((normalizedMonthlySold / 20) * 25, 0, 25));
  const demandSignal = round1(clamp((repeatedQuestions / 10) * 15, 0, 15));

  let campaignSignal = 0;
  let campaignSampleQualified = false;
  if (impressions >= 100) {
    campaignSampleQualified = true;
    const ctr = clicks / impressions;
    const conversionRate = clicks > 0 ? conversions / clicks : 0;
    campaignSignal = round1(clamp((ctr / 0.05) * 12 + (conversionRate / 0.03) * 8, 0, 20));
  }

  const components = {
    evidenceQuality,
    freshness,
    marketActivity,
    demandSignal,
    campaignSignal,
  };
  const score = round1(Object.values(components).reduce((sum, value) => sum + value, 0));

  const blockers = [];
  if (ageHours > 168) blockers.push("required market evidence is older than 7 days");
  if (soldCount < 3) blockers.push("fewer than 3 reviewed sold observations");
  if (Number(event.soldEvidence.medianUSD) <= 0) blockers.push("sold median is not positive");
  if (activeCount === 0) blockers.push("no active supply was observed");
  if (score < threshold) blockers.push(`score ${score} is below publish threshold ${threshold}`);

  const decision = blockers.length ? "HOLD" : "PUBLISH";
  const notes = [];
  if (!campaignSampleQualified) notes.push("campaign history is below the 100-impression minimum and contributes 0 points");
  if (activeCount > 0) {
    const activityRatio = soldCount / (soldCount + activeCount);
    notes.push(`observed sold-to-total activity ratio: ${round1(activityRatio * 100)}% (context only; not a profit forecast)`);
  }

  return {
    schema: OPPORTUNITY_DECISION_SCHEMA,
    productId: event.productId,
    observedAt: event.observedAt,
    evaluatedAt: nowDate.toISOString(),
    decision,
    score,
    publishThreshold: threshold,
    components,
    blockers,
    notes,
    evidence: {
      soldCount,
      soldWindowDays: Number(event.soldEvidence.windowDays),
      activeCount,
      repeatedQuestions,
      campaignSampleQualified,
      ageHours: round1(ageHours),
    },
  };
}

export function assertOpportunityPublishable(event, options = {}) {
  const result = scoreOpportunity(event, options);
  if (result.decision !== "PUBLISH") throw new Error(`Opportunity held: ${result.blockers.join("; ")}`);
  return result;
}
