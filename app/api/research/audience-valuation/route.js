import crypto from "node:crypto";

import { recordAudienceValuation } from "../../../../lib/mr-know-it-all-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function requestFingerprint(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("user-agent") || "anonymous";
  return crypto.createHash("sha256").update(source).digest("hex");
}

function price(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100000000 ? Math.round(n * 100) / 100 : null;
}

export async function POST(request) {
  if (!originAllowed(request)) return json({ error: "Origin not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, { status: 400 }); }

  const question = String(body?.question ?? "").trim().slice(0, 120);
  const rawOffer = price(body?.rawOffer);
  const gradedOffer = price(body?.gradedOffer);
  const gradeAssumption = String(body?.gradeAssumption ?? "").trim().slice(0, 80) || null;
  if (question.length < 2 || (rawOffer === null && gradedOffer === null)) {
    return json({ error: "Question and at least one raw or graded offer are required." }, { status: 400 });
  }

  const result = await recordAudienceValuation({
    question,
    rawOffer,
    gradedOffer,
    gradeAssumption,
    responderHash: requestFingerprint(request),
    sourcePlatform: "blindboxai",
  }).catch(() => ({ stored: false, reason: "write_failed" }));

  if (!result.stored) return json({ error: "Research response storage is temporarily unavailable." }, { status: 503 });
  return json({ ok: true, researchOnly: true, soldEvidence: false });
}
