const HOUR_MS = 60 * 60 * 1000;
const HOURS = 24;

export function parseContentRangeTotal(value) {
  const text = String(value || "");
  const match = text.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function hourlyBuckets(rows, timestampKey, nowInput = new Date()) {
  const now = new Date(nowInput);
  const endHour = new Date(now);
  endHour.setUTCMinutes(0, 0, 0);
  const startMs = endHour.getTime() - (HOURS - 1) * HOUR_MS;
  const buckets = Array.from({ length: HOURS }, (_, i) => ({
    at: new Date(startMs + i * HOUR_MS).toISOString(),
    count: 0,
  }));

  for (const row of Array.isArray(rows) ? rows : []) {
    const value = row?.[timestampKey];
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    const index = Math.floor((ms - startMs) / HOUR_MS);
    if (index >= 0 && index < HOURS) buckets[index].count += 1;
  }
  return buckets;
}

function safeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function safeMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export function buildWallpaperSnapshot({
  generatedAt = new Date().toISOString(),
  counts = {},
  revenueUsd = 0,
  clickRows = [],
  analyticsRows = [],
  questionRows = [],
  videoRows = [],
} = {}) {
  const now = new Date(generatedAt);
  return {
    generatedAt: now.toISOString(),
    refreshSeconds: 900,
    totals: {
      rawClicks: safeInt(counts.rawClicks),
      qualifiedClicks: safeInt(counts.qualifiedClicks),
      analyticsEvents: safeInt(counts.analyticsEvents),
      questions: safeInt(counts.questions),
      publishedVideos: safeInt(counts.publishedVideos),
      reviewQueue: safeInt(counts.reviewQueue),
      priceObservations: safeInt(counts.priceObservations),
      waitlistSignups: safeInt(counts.waitlistSignups),
      confirmedConversions: safeInt(counts.confirmedConversions),
      confirmedRevenueUsd: safeMoney(revenueUsd),
    },
    last24h: {
      qualifiedClicks: hourlyBuckets(clickRows, "clicked_at", now),
      analyticsEvents: hourlyBuckets(analyticsRows, "captured_at", now),
      questions: hourlyBuckets(questionRows, "created_at", now),
      publishedVideos: hourlyBuckets(videoRows, "published_at", now),
    },
    status: {
      conversionEvidence: safeInt(counts.confirmedConversions) > 0 ? "verified" : "not-yet-recorded",
      privacy: "aggregate-only",
    },
  };
}
