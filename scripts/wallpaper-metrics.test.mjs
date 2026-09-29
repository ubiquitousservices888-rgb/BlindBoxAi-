import assert from "node:assert/strict";
import test from "node:test";
import { buildWallpaperSnapshot, hourlyBuckets, parseContentRangeTotal } from "../lib/wallpaper-metrics.mjs";

test("parses PostgREST content-range totals", () => {
  assert.equal(parseContentRangeTotal("0-0/1396"), 1396);
  assert.equal(parseContentRangeTotal("*/0"), 0);
  assert.equal(parseContentRangeTotal(null), null);
});

test("builds a complete rolling 24-hour window and rejects future rows", () => {
  const now = new Date("2026-09-28T20:30:00.000Z");
  const rows = [
    { at: "2026-09-27T20:29:00.000Z" },
    { at: "2026-09-27T20:31:00.000Z" },
    { at: "2026-09-28T19:20:00.000Z" },
    { at: "2026-09-28T20:01:00.000Z" },
    { at: "2026-09-28T20:30:00.000Z" },
    { at: "2026-09-28T20:31:00.000Z" },
    { at: "bad" },
  ];
  const buckets = hourlyBuckets(rows, "at", now);
  assert.equal(buckets.length, 24);
  assert.equal(buckets[0].count, 1);
  assert.equal(buckets.at(-2).count, 1);
  assert.equal(buckets.at(-1).count, 2);
  assert.equal(buckets.reduce((n, row) => n + row.count, 0), 4);
});

test("snapshot contains aggregate-only totals and real series", () => {
  const generatedAt = "2026-09-28T20:30:00.000Z";
  const snapshot = buildWallpaperSnapshot({
    generatedAt,
    counts: {
      rawClicks: 1396,
      qualifiedClicks: 27,
      analyticsEvents: 69,
      questions: 404,
      publishedVideos: 10,
      reviewQueue: 3,
      priceObservations: 1566,
      waitlistSignups: 1,
      confirmedConversions: -2,
      bogusCount: "not-a-number",
    },
    revenueUsd: -15,
    clickRows: [{ clicked_at: "2026-09-28T20:10:00.000Z" }],
  });
  assert.equal(snapshot.refreshSeconds, 900);
  assert.equal(snapshot.totals.rawClicks, 1396);
  assert.equal(snapshot.totals.reviewQueue, 3);
  assert.equal(snapshot.totals.publishedVideos, 10);
  assert.equal(snapshot.totals.confirmedConversions, 0);
  assert.equal(snapshot.totals.confirmedRevenueUsd, 0);
  assert.equal(snapshot.status.conversionEvidence, "not-yet-recorded");
  assert.equal(snapshot.status.privacy, "aggregate-only");
  assert.equal(snapshot.last24h.qualifiedClicks.at(-1).count, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "recentClicks"), false);
});
