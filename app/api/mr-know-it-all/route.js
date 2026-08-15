import crypto from "node:crypto";

import { after } from "next/server.js";

import { askMrKnowItAll } from "../../../lib/mr-know-it-all-agent.mjs";
import { recordPrivateQuestion } from "../../../lib/private-question-analytics.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 6;
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
    for (const [bucketKey, value] of buckets) {
      if (now >= value.resetAt) buckets.delete(bucketKey);
    }
  }
  return {
    allowed: current.count <= MAX_REQUESTS_PER_WINDOW,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}

function originAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([new URL(request.url).origin]);
  const configured = String(process.env.BLINDBOXAI_SITE_URL ?? "").trim();
  try {
    if (configured) allowed.add(new URL(configured).origin);
  } catch {
    return false;
  }
  return allowed.has(origin);
}

export async function POST(request) {
  if (process.env.MR_KNOW_IT_ALL_ENABLED !== "true") {
    return json({ error: "Mr. Know It All is not enabled yet." }, { status: 503 });
  }
  if (!originAllowed(request)) return json({ error: "Origin not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return json({ error: "Request body is too large." }, { status: 413 });
  }

  const limit = takeRateLimit(request);
  if (!limit.allowed) {
    return json(
      { error: "Please wait a moment before asking another question." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (![process.env.OPENAI_API_KEY, process.env.MR_PRIVATE_BLOB_READ_WRITE_TOKEN, process.env.MR_RESEARCH_ENCRYPTION_KEY]
    .every((value) => String(value ?? "").trim())) {
    return json({ error: "Mr. Know It All is not fully configured yet." }, { status: 503 });
  }

  try {
    const result = await askMrKnowItAll(body?.question);
    after(async () => {
      try {
        await recordPrivateQuestion({ question: body.question, answer: result });
      } catch (trackingError) {
        console.error("Encrypted private question tracking failed", { name: trackingError?.name });
      }
    });
    return json(result);
  } catch (error) {
    const message = String(error?.message ?? "");
    if (/complete blind-box question|characters or fewer|cannot reveal|cannot transact/i.test(message)) {
      return json({ error: message }, { status: 400 });
    }
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return json({ error: "Research took too long. Please try a narrower question." }, { status: 504 });
    }
    console.error("Mr. Know It All request failed", { name: error?.name });
    return json({ error: "Mr. Know It All is temporarily unavailable." }, { status: 503 });
  }
}
