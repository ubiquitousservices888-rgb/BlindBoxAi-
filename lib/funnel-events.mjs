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

export function isProductionEvent(event) {
  return event?.namespace === "production" && event?.test !== true;
}

export function isProviderConfirmedConversion(event) {
  return isProductionEvent(event) &&
    event?.event === FUNNEL_EVENTS.PROVIDER_CONVERSION &&
    [EVENT_STATUS.PROVIDER_CONFIRMED, EVENT_STATUS.RECONCILED].includes(event?.status) &&
    typeof event?.providerEvidenceId === "string" && event.providerEvidenceId.length > 0;
}

export function confirmedRevenue(event) {
  if (!isProviderConfirmedConversion(event)) return 0;
  const amount = Number(event?.confirmedRevenueUSD);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export function stableEvidenceKey(event) {
  if (!isProviderConfirmedConversion(event)) return null;
  return `${event.provider || "unknown"}:${event.providerEvidenceId}`;
}

function countBy(events, field, fallback = "unknown") {
  const counts = new Map();
  for (const event of events) {
    const key = String(event?.[field] || fallback);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function conversionRate(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export function aggregateFunnel(events = []) {
  const production = events.filter(isProductionEvent);
  const dedupedConversions = new Map();
  for (const event of production) {
    const key = stableEvidenceKey(event);
    if (key && !dedupedConversions.has(key)) dedupedConversions.set(key, event);
  }

  const count = (name) => production.filter((event) => event.event === name).length;
  const conversions = [...dedupedConversions.values()];
  const revenue = conversions.reduce((sum, event) => sum + confirmedRevenue(event), 0);
  const rejectedEvidence = production.filter((event) => event.event === FUNNEL_EVENTS.PROVIDER_CONVERSION && event.status === EVENT_STATUS.REJECTED).length;

  const totals = {
    pageViews: count(FUNNEL_EVENTS.PAGE_VIEW),
    landingSources: count(FUNNEL_EVENTS.LANDING_SESSION_SOURCE),
    questions: count(FUNNEL_EVENTS.AGENT_QUESTION),
    signups: count(FUNNEL_EVENTS.WAITLIST_SIGNUP),
    outboundClicks: count(FUNNEL_EVENTS.OUTBOUND_AFFILIATE_CLICK),
    providerConfirmedConversions: conversions.length,
    confirmedRevenueUSD: Number(revenue.toFixed(2)),
    rejectedEvidence,
  };

  const sourceEvents = production.filter((event) => [FUNNEL_EVENTS.PAGE_VIEW, FUNNEL_EVENTS.LANDING_SESSION_SOURCE].includes(event.event));
  const campaignEvents = production.filter((event) => event.campaign || event.campaignId);
  const clickEvents = production.filter((event) => event.event === FUNNEL_EVENTS.OUTBOUND_AFFILIATE_CLICK);
  const questionEvents = production.filter((event) => event.event === FUNNEL_EVENTS.AGENT_QUESTION);

  return {
    ...totals,
    rates: {
      clicksPerViewPct: conversionRate(totals.outboundClicks, totals.pageViews),
      signupsPerViewPct: conversionRate(totals.signups, totals.pageViews),
      confirmedConversionsPerClickPct: conversionRate(totals.providerConfirmedConversions, totals.outboundClicks),
    },
    breakdowns: {
      sources: countBy(sourceEvents, "source", "direct"),
      campaigns: countBy(campaignEvents.map((event) => ({ ...event, campaignKey: event.campaign || event.campaignId })), "campaignKey"),
      clickSeries: countBy(clickEvents, "seriesSlug"),
      clickFigures: countBy(clickEvents, "figure"),
      clickPlacements: countBy(clickEvents, "placement"),
      questionsBySeries: countBy(questionEvents.filter((event) => event.seriesSlug), "seriesSlug"),
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
