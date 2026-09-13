import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_AUDIENCE = "blindboxai-research-bot";
const GITHUB_REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const GITHUB_WORKFLOW_REF = `${GITHUB_REPOSITORY}/.github/workflows/mr-know-it-all-tool-bot.yml@refs/heads/main`;
const githubJwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const publicBuckets = new Map<string, { count: number; resetAt: number }>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function cleanText(value: unknown, max = 240) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function money(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100000000 ? Math.round(n * 100) / 100 : null;
}

function clientKey(req: Request) {
  return cleanText(req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("user-agent") || "anonymous", 120);
}

function publicRateAllowed(req: Request) {
  const now = Date.now();
  const key = clientKey(req);
  const current = publicBuckets.get(key);
  if (!current || now >= current.resetAt) {
    publicBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function githubBotAuthorized(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return false;
    const { payload } = await jwtVerify(token, githubJwks, {
      issuer: GITHUB_ISSUER,
      audience: GITHUB_AUDIENCE,
    });
    return payload.repository === GITHUB_REPOSITORY &&
      payload.ref === "refs/heads/main" &&
      payload.workflow_ref === GITHUB_WORKFLOW_REF &&
      ["schedule", "workflow_dispatch"].includes(String(payload.event_name || ""));
  } catch {
    return false;
  }
}

async function handleQuestion(body: any) {
  const questionRedacted = cleanText(body?.questionRedacted, 180);
  const questionHash = cleanText(body?.questionHash, 128);
  const vertical = cleanText(body?.vertical, 80) || null;
  const intent = cleanText(body?.intent, 80) || null;
  const resultCount = Math.max(0, Math.min(1000, Number(body?.resultCount) || 0));
  const answered = Boolean(body?.answered);
  const confidence = cleanText(body?.confidence, 40) || null;
  if (!questionRedacted || !/^[a-f0-9]{64}$/.test(questionHash)) return json({ error: "Question fields required" }, 400);

  const { error } = await db.from("mr_know_it_all_questions").insert({
    question_hash: questionHash,
    question_redacted: questionRedacted,
    vertical,
    intent,
    result_count: resultCount,
    answered,
    confidence,
    source_mode: "deterministic",
    metadata: { research_only: true },
  });
  if (error) return json({ error: "Question storage failed" }, 500);

  if (!answered) {
    await db.from("mr_know_it_all_research_queue").upsert({
      query_key: questionHash,
      vertical,
      reason: "unanswered_public_question",
      priority: vertical === "pokemon_tcg" ? 95 : 70,
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "query_key,reason" });
  }
  return json({ ok: true });
}

async function handleAudience(body: any) {
  const queryKey = cleanText(body?.queryKey, 128);
  const rawOffer = money(body?.rawOffer);
  const gradedOffer = money(body?.gradedOffer);
  const sourcePlatform = cleanText(body?.sourcePlatform, 40) || "blindboxai";
  const sourceContentId = cleanText(body?.sourceContentId, 160) || null;
  const sourceResponseId = cleanText(body?.sourceResponseId, 160) || null;
  const responderHash = cleanText(body?.responderHash, 128) || null;
  const gradeAssumption = cleanText(body?.gradeAssumption, 80) || null;
  if (!/^[a-f0-9]{64}$/.test(queryKey) || (rawOffer === null && gradedOffer === null)) return json({ error: "Offer and query key required" }, 400);

  const { error } = await db.from("audience_valuation_responses").insert({
    query_key: queryKey,
    source_platform: sourcePlatform,
    source_content_id: sourceContentId,
    source_response_id: sourceResponseId,
    responder_hash: responderHash,
    raw_offer: rawOffer,
    graded_offer: gradedOffer,
    grade_assumption: gradeAssumption,
    research_only: true,
    metadata: { market_evidence: false, sold_evidence: false },
  });
  if (error && error.code !== "23505") return json({ error: "Audience response storage failed" }, 500);
  return json({ ok: true, duplicate: error?.code === "23505" });
}

async function handleBotSeed(body: any) {
  const seeds = Array.isArray(body?.seeds) ? body.seeds.slice(0, 10) : [];
  let seeded = 0;
  for (const seed of seeds) {
    const question = cleanText(seed?.question, 180);
    const vertical = cleanText(seed?.vertical, 80) || null;
    const priority = Math.max(0, Math.min(100, Number(seed?.priority) || 50));
    if (question.length < 4) continue;
    const key = await sha256(question);
    const { data: existing } = await db.from("mr_know_it_all_questions").select("id").eq("question_hash", key).limit(1);
    if (!existing?.length) {
      await db.from("mr_know_it_all_questions").insert({
        question_hash: key,
        question_redacted: question,
        vertical,
        intent: "automatic_research",
        result_count: 0,
        answered: false,
        confidence: null,
        source_mode: "tool_bot_repeater",
        metadata: { research_only: true, automatic_repeater: true },
      });
    }
    const { error } = await db.from("mr_know_it_all_research_queue").upsert({
      query_key: key,
      vertical,
      reason: "automatic_repeater",
      priority,
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_note: "Seeded by bounded automatic research repeater.",
    }, { onConflict: "query_key,reason" });
    if (!error) seeded += 1;
  }
  return json({ ok: true, seeded });
}

async function handleBotPull(body: any) {
  const limit = Math.max(1, Math.min(10, Number(body?.limit) || 5));
  const now = new Date().toISOString();
  const { data: queue, error } = await db.from("mr_know_it_all_research_queue")
    .select("id,query_key,vertical,reason,priority,status,attempts,next_attempt_at,created_at")
    .eq("status", "queued")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return json({ error: "Queue lookup failed" }, 500);

  const items = [];
  for (const row of queue || []) {
    const { data: questions } = await db.from("mr_know_it_all_questions")
      .select("question_redacted")
      .eq("question_hash", row.query_key)
      .order("created_at", { ascending: false })
      .limit(1);
    const questionRedacted = cleanText(questions?.[0]?.question_redacted, 180);
    if (!questionRedacted) continue;
    const attempts = Number(row.attempts || 0) + 1;
    const { error: claimError } = await db.from("mr_know_it_all_research_queue").update({
      status: "researching",
      attempts,
      last_attempt_at: now,
      updated_at: now,
      last_note: "Claimed by Mr. Know It All research tool bot.",
    }).eq("id", row.id).eq("status", "queued");
    if (claimError) continue;
    items.push({
      id: row.id,
      queryKey: row.query_key,
      vertical: row.vertical,
      reason: row.reason,
      priority: row.priority,
      attempts,
      questionRedacted,
    });
  }
  return json({ ok: true, items });
}

async function handleBotSold(body: any) {
  const queryKey = cleanText(body?.queryKey, 128);
  const sourcePlatform = cleanText(body?.sourcePlatform, 80);
  const sourceRecordId = cleanText(body?.sourceRecordId, 160);
  const sourceUrl = cleanText(body?.sourceUrl, 500) || null;
  const amount = money(body?.amount);
  const conditionType = cleanText(body?.conditionType, 20);
  const soldAt = cleanText(body?.soldAt, 64);
  if (!/^[a-f0-9]{64}$/.test(queryKey) || !sourcePlatform || !sourceRecordId || !amount || !["raw", "graded"].includes(conditionType) || !soldAt) {
    return json({ error: "Sold observation fields invalid" }, 400);
  }
  if (body?.exactMatch !== true || body?.verified !== true) return json({ error: "Exact verified completed sale required" }, 400);

  const { error } = await db.from("sold_price_observations").insert({
    query_key: queryKey,
    source_platform: sourcePlatform,
    source_record_id: sourceRecordId,
    source_url: sourceUrl,
    sold_at: soldAt,
    amount,
    currency: "USD",
    condition_type: conditionType,
    grader: cleanText(body?.grader, 40) || null,
    grade: cleanText(body?.grade, 40) || null,
    sale_type: cleanText(body?.saleType, 40) || null,
    exact_match: true,
    verified: true,
    metadata: { completed_sale: true, ingested_by: "mr_know_it_all_tool_bot" },
  });
  if (error && error.code !== "23505") return json({ error: "Sold observation storage failed" }, 500);
  return json({ ok: true, duplicate: error?.code === "23505" });
}

async function handleBotFinish(body: any) {
  const queueId = cleanText(body?.queueId, 80);
  const status = cleanText(body?.status, 20);
  if (!queueId || !["queued", "verified", "blocked"].includes(status)) return json({ error: "Queue finish fields invalid" }, 400);
  const retryHours = Math.max(1, Math.min(168, Number(body?.retryHours) || 6));
  const nextAttemptAt = status === "queued" ? new Date(Date.now() + retryHours * 3600_000).toISOString() : null;
  const lastResult = body?.result && typeof body.result === "object" ? body.result : {};
  const { error } = await db.from("mr_know_it_all_research_queue").update({
    status,
    next_attempt_at: nextAttemptAt,
    updated_at: new Date().toISOString(),
    last_note: cleanText(body?.note, 500) || null,
    last_result: lastResult,
  }).eq("id", queueId);
  if (error) return json({ error: "Queue update failed" }, 500);
  return json({ ok: true, status, nextAttemptAt });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "JSON required" }, 415);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const type = cleanText(body?.type, 40);

  if (type === "question" || type === "audience_response") {
    if (!publicRateAllowed(req)) return json({ error: "Rate limit exceeded" }, 429);
    return type === "question" ? handleQuestion(body) : handleAudience(body);
  }

  if (!["bot_seed", "bot_pull", "bot_sold_observation", "bot_finish"].includes(type)) return json({ error: "Unknown ingestion type" }, 400);
  if (!await githubBotAuthorized(req)) return json({ error: "GitHub research bot authorization required" }, 403);
  if (type === "bot_seed") return handleBotSeed(body);
  if (type === "bot_pull") return handleBotPull(body);
  if (type === "bot_sold_observation") return handleBotSold(body);
  return handleBotFinish(body);
});
