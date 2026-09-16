import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";
import { buildAskVisualClickPath, normalizeAskVisualQuery } from "../../../../lib/ask-visual-search.mjs";
import {
  ebayProductionApiConfigured,
  normalizeEbayAffiliateReference,
  searchEbayProductionListings,
} from "../../../../lib/ebay-production-api.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const buckets = new Map();

function json(payload, status = 200, headers = {}) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function requestFingerprint(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("user-agent") || "anonymous";
  return crypto.createHash("sha256").update(source).digest("hex");
}

function takeRateLimit(request, now = Date.now()) {
  const key = requestFingerprint(request);
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (buckets.size > 2_000) {
    for (const [bucketKey, value] of buckets) {
      if (now >= value.resetAt) buckets.delete(bucketKey);
    }
  }
  return {
    allowed: current.count <= MAX_REQUESTS_PER_WINDOW,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}

function publicItems(items, campaignId, source) {
  return items
    .filter(item => item?.itemId && item?.title)
    .map(({ affiliateUrl: _affiliateUrl, seller: _seller, ...item }) => ({
      ...item,
      clickPath: buildAskVisualClickPath(item.itemId, campaignId, source),
    }));
}

export async function GET(request) {
  const limit = takeRateLimit(request);
  if (!limit.allowed) {
    return json(
      { error: "Please wait a moment before searching again.", items: [] },
      429,
      { "Retry-After": String(limit.retryAfter) },
    );
  }

  const url = new URL(request.url);
  const rawQuery = String(url.searchParams.get("q") || "").trim();
  const query = normalizeAskVisualQuery(rawQuery);

  if (rawQuery.length < 2 || rawQuery.length > 120 || query.length < 2) {
    return json({ error: "Search must be between 2 and 120 characters.", items: [] }, 400);
  }

  if (!ebayProductionApiConfigured()) {
    return json({ configured: false, query, items: [] }, 503);
  }

  const campaignId = normalizeCampaignId(url.searchParams.get("campaign"));
  const source = normalizeSource(url.searchParams.get("source") || "ask");
  const referenceId = normalizeEbayAffiliateReference(
    ["bb-ask-visual", campaignId || "none", source].join("-"),
  );

  try {
    const result = await searchEbayProductionListings({
      query,
      affiliateReferenceId: referenceId,
      limit: 8,
    });

    return json({
      configured: true,
      query,
      total: result.total,
      items: publicItems(result.items, campaignId, source),
    });
  } catch (cause) {
    const status = Number(cause?.status || 0);
    const code = cause?.code || "EBAY_API_UNAVAILABLE";

    console.error("ebay_ask_visual_lookup_failed", {
      queryLength: query.length,
      status: status || null,
      code,
    });

    return json({ configured: true, query, errorCode: code, items: [] }, 503);
  }
}
