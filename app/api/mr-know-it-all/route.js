import crypto from "node:crypto";

import { buildDeterministicCompResponse } from "../../../lib/deterministic-comp-lookup.mjs";
import { recordFunnelEvent } from "../../../lib/funnel-event-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const buckets = new Map();

function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init.headers ?? {}),
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
    for (const [bucketKey, value] of buckets) if (now >= value.resetAt) buckets.delete(bucketKey);
  }
  return { allowed: current.count <= MAX_REQUESTS_PER_WINDOW, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)) };
}

function originAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([new URL(request.url).origin]);
  const configured = String(process.env.BLINDBOXAI_SITE_URL ?? "").trim();
  try { if (configured) allowed.add(new URL(configured).origin); } catch { return false; }
  return allowed.has(origin);
}

export async function POST(request) {
  if (!originAllowed(request)) return json({ error: "Origin not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Content-Type must be application/json." }, { status: 415 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) return json({ error: "Request body is too large." }, { status: 413 });

  const limit = takeRateLimit(request);
  if (!limit.allowed) return json({ error: "Please wait a moment before searching again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const query = String(body?.question ?? body?.query ?? "").trim();
  if (query.length < 2 || query.length > 120) return json({ error: "Search must be between 2 and 120 characters." }, { status: 400 });

  try {
    const result = buildDeterministicCompResponse(query);
    const first = Array.isArray(result.matches) ? result.matches[0] : null;
    try {
      await recordFunnelEvent({
        event: "agent_question",
        status: "observed",
        category: "deterministic_comp_lookup",
        resultCount: Array.isArray(result.matches) ? result.matches.length : 0,
        seriesSlug: first?.seriesSlug || first?.series?.slug || null,
        figure: first?.figure || first?.name || null,
        queryTextStored: false,
      });
    } catch (error) {
      console.error("agent_question_log_failed", { name: error?.name });
    }
    console.info("agent_question", { piiStored: false, queryLength: query.length, resultCount: result.matches.length, mode: "deterministic" });
    return json(result);
  } catch (error) {
    console.error("deterministic_comp_lookup_failed", { name: error?.name });
    return json({ error: "Verified comp lookup is temporarily unavailable." }, { status: 503 });
  }
}
