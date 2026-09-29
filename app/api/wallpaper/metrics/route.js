import { NextResponse } from "next/server";

import { buildWallpaperSnapshot, parseContentRangeTotal } from "../../../../lib/wallpaper-metrics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_CACHE = "public, s-maxage=300, stale-while-revalidate=600";
const MAX_SERIES_ROWS = 2000;

function config() {
  return {
    url: String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, ""),
    key: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  };
}

function headers(key, { count = false } = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(count ? { Prefer: "count=exact" } : {}),
  };
}

async function countRows(url, key, table, filter = "") {
  const response = await fetch(`${url}/rest/v1/${table}?select=id${filter}`, {
    headers: { ...headers(key, { count: true }), Range: "0-0" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`count_failed:${table}:${response.status}`);
  const total = parseContentRangeTotal(response.headers.get("content-range"));
  if (total === null) throw new Error(`count_missing:${table}`);
  return total;
}

async function readRows(url, key, table, select, filter = "") {
  const response = await fetch(`${url}/rest/v1/${table}?select=${select}${filter}&limit=${MAX_SERIES_ROWS}`, {
    headers: headers(key),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`series_failed:${table}:${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

async function conversionRevenue(url, key) {
  const rows = await readRows(
    url,
    key,
    "provider_conversion_evidence",
    "confirmed_revenue_usd,status",
    "&status=in.(provider_confirmed,reconciled)&order=observed_at.desc",
  );
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row?.confirmed_revenue_usd) || 0), 0);
}

export async function GET() {
  const { url, key } = config();
  if (!url || !key) {
    return NextResponse.json({ error: "Metrics temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const now = new Date();
    const since = encodeURIComponent(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

    const [
      rawClicks,
      qualifiedClicks,
      analyticsEvents,
      questions,
      publishedVideos,
      reviewQueue,
      priceObservations,
      waitlistSignups,
      confirmedConversions,
      revenueUsd,
      clickRows,
      analyticsRows,
      questionRows,
      videoRows,
    ] = await Promise.all([
      countRows(url, key, "affiliate_clicks"),
      countRows(url, key, "affiliate_clicks", "&client_class=eq.human_candidate"),
      countRows(url, key, "analytics_events", "&namespace=eq.production"),
      countRows(url, key, "mr_know_it_all_questions"),
      countRows(url, key, "published_collectible_videos"),
      countRows(url, key, "review_video_queue"),
      countRows(url, key, "sold_price_observations"),
      countRows(url, key, "waitlist_signups"),
      countRows(url, key, "provider_conversion_evidence", "&status=in.(provider_confirmed,reconciled)"),
      conversionRevenue(url, key),
      readRows(url, key, "affiliate_clicks", "clicked_at", `&client_class=eq.human_candidate&clicked_at=gte.${since}&order=clicked_at.asc`),
      readRows(url, key, "analytics_events", "captured_at", `&namespace=eq.production&captured_at=gte.${since}&order=captured_at.asc`),
      readRows(url, key, "mr_know_it_all_questions", "created_at", `&created_at=gte.${since}&order=created_at.asc`),
      readRows(url, key, "published_collectible_videos", "published_at", `&published_at=gte.${since}&order=published_at.asc`),
    ]);

    const snapshot = buildWallpaperSnapshot({
      generatedAt: now.toISOString(),
      counts: {
        rawClicks,
        qualifiedClicks,
        analyticsEvents,
        questions,
        publishedVideos,
        reviewQueue,
        priceObservations,
        waitlistSignups,
        confirmedConversions,
      },
      revenueUsd,
      clickRows,
      analyticsRows,
      questionRows,
      videoRows,
    });

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": PUBLIC_CACHE,
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("wallpaper_metrics_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Metrics temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
