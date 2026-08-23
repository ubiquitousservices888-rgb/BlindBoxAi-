export const EVENT_STATUS = Object.freeze({
  OBSERVED: "observed",
  PROVIDER_CONFIRMED: "provider_confirmed",
  RECONCILED: "reconciled",
  REJECTED: "rejected",
});

export const FUNNEL_EVENTS = Object.freeze({
  PAGE_VIEW: "page_view",
  LANDING_SESSION_SOURCE: "landing_session_source",
  AGENT_QUESTION: "agent_question",
  WAITLIST_SIGNUP: "waitlist_signup",
  OUTBOUND_AFFILIATE_CLICK: "outbound_affiliate_click",
  PROVIDER_CONVERSION: "provider_conversion",
});

export const MAX_CONFIRMED_REVENUE_USD = Math.floor(Number.MAX_SAFE_INTEGER / 100);
const MAX_CONFIRMED_REVENUE_CENTS = BigInt(MAX_CONFIRMED_REVENUE_USD) * 100n;
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

const CONFIRMED_STATUSES = new Set([
  EVENT_STATUS.PROVIDER_CONFIRMED,
  EVENT_STATUS.RECONCILED,
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function dimension(value, fallback = "unknown") {
  return isNonEmptyString(value) ? value.trim() : fallback;
}

function hasDimension(event, field) {
  return isNonEmptyString(event?.[field]);
}

export function isProductionEvent(event) {
  return event?.namespace === "production" && event?.test === false;
}

export function isProviderConfirmedConversion(event) {
  return isProductionEvent(event) &&
    event?.event === FUNNEL_EVENTS.PROVIDER_CONVERSION &&
    CONFIRMED_STATUSES.has(event?.status) &&
    isNonEmptyString(event?.provider) &&
    isNonEmptyString(event?.providerEvidenceId);
}

export function confirmedRevenue(event) {
  if (!isProviderConfirmedConversion(event)) return 0;

  const cents = confirmedRevenueCents(event);
  return cents === null ? 0 : Number(cents) / 100;
}

function confirmedRevenueCents(event) {
  if (!isProviderConfirmedConversion(event)) return null;

  const rawAmount = event?.confirmedRevenueUSD;
  if (
    !["number", "string"].includes(typeof rawAmount) ||
    (typeof rawAmount === "string" && rawAmount.trim() === "")
  ) {
    return null;
  }

  const normalizedAmount = String(rawAmount).trim();
  const match = normalizedAmount.match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const wholeCents = BigInt(match[1]) * 100n;
  const fractionalCents = BigInt((match[2] || "").padEnd(2, "0") || "0");
  const cents = wholeCents + fractionalCents;
  return cents <= MAX_CONFIRMED_REVENUE_CENTS ? cents : null;
}

export function stableEvidenceKey(event) {
  if (!isProviderConfirmedConversion(event)) return null;
  return JSON.stringify([event.provider, event.providerEvidenceId]);
}

function countBy(events, field, fallback = "unknown") {
  const counts = new Map();
  for (const event of events) {
    const key = dimension(event?.[field], fallback);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) =>
      right.count - left.count || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
    );
}

export function conversionRate(numerator, denominator) {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator < 0 ||
    denominator <= 0
  ) {
    return null;
  }
  const rate = (numerator / denominator) * 100;
  return Number.isFinite(rate) ? Number(rate.toFixed(2)) : null;
}

function sumConfirmedRevenue(conversions) {
  let totalCents = 0n;
  let invalidRevenueEvidence = 0;
  for (const event of conversions) {
    const cents = confirmedRevenueCents(event);
    if (cents === null) {
      invalidRevenueEvidence += 1;
      continue;
    }
    totalCents += cents;
  }
  const revenueOverflow = totalCents > MAX_SAFE_CENTS;
  return {
    confirmedRevenueUSD: revenueOverflow ? null : Number(totalCents) / 100,
    invalidRevenueEvidence,
    revenueOverflow,
  };
}

export function aggregateFunnel(events = []) {
  const production = Array.isArray(events) ? events.filter(isProductionEvent) : [];
  const dedupedConversions = new Map();
  for (const event of production) {
    const key = stableEvidenceKey(event);
    if (key && !dedupedConversions.has(key)) dedupedConversions.set(key, event);
  }

  const count = (name, predicate = () => true) =>
    production.filter((event) => event?.event === name && predicate(event)).length;
  const conversions = [...dedupedConversions.values()];
  const revenue = sumConfirmedRevenue(conversions);
  const totals = {
    pageViews: count(FUNNEL_EVENTS.PAGE_VIEW),
    landingSources: count(FUNNEL_EVENTS.LANDING_SESSION_SOURCE),
    questions: count(FUNNEL_EVENTS.AGENT_QUESTION),
    confirmedSignups: count(
      FUNNEL_EVENTS.WAITLIST_SIGNUP,
      (event) => event?.providerConfirmed === true,
    ),
    outboundClicks: count(FUNNEL_EVENTS.OUTBOUND_AFFILIATE_CLICK),
    providerConfirmedConversions: conversions.length,
    ...revenue,
    rejectedEvidence: count(
      FUNNEL_EVENTS.PROVIDER_CONVERSION,
      (event) => event?.status === EVENT_STATUS.REJECTED,
    ),
  };

  const landingEvents = production.filter(
    (event) => event?.event === FUNNEL_EVENTS.LANDING_SESSION_SOURCE,
  );
  const clickEvents = production.filter(
    (event) => event?.event === FUNNEL_EVENTS.OUTBOUND_AFFILIATE_CLICK,
  );
  const questionEvents = production.filter(
    (event) => event?.event === FUNNEL_EVENTS.AGENT_QUESTION,
  );

  return {
    ...totals,
    zeroState: conversions.length === 0 ? "No verified conversions yet" : null,
    rates: {
      clicksPerViewPct: conversionRate(totals.outboundClicks, totals.pageViews),
      signupsPerViewPct: conversionRate(totals.confirmedSignups, totals.pageViews),
      confirmedConversionsPerClickPct: conversionRate(
        totals.providerConfirmedConversions,
        totals.outboundClicks,
      ),
    },
    breakdowns: {
      sources: countBy(landingEvents, "source", "direct"),
      campaigns: countBy(landingEvents.filter((event) => hasDimension(event, "campaign")), "campaign"),
      contentIds: countBy(landingEvents.filter((event) => hasDimension(event, "contentId")), "contentId"),
      clickSeries: countBy(clickEvents, "seriesSlug"),
      clickFigures: countBy(clickEvents, "figure"),
      clickPlacements: countBy(clickEvents, "placement"),
      clickCustomIds: countBy(clickEvents, "customId"),
      questionsBySeries: countBy(
        questionEvents.filter((event) => hasDimension(event, "seriesSlug")),
        "seriesSlug",
      ),
    },
    conversions: conversions.map((event) => ({
      provider: event.provider,
      providerEvidenceId: event.providerEvidenceId,
      customId: event.customId,
      status: event.status,
      occurredAt: event.occurredAt,
      confirmedRevenueUSD: confirmedRevenue(event),
    })),
  };
}
