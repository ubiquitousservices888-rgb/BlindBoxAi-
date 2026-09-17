import crypto from "node:crypto";

import { put } from "@vercel/blob";

import { encryptPrivateResearch } from "./private-research-vault.mjs";

export const PRIVATE_QUESTION_SCHEMA = "blindboxai/private-question-demand/v1";
export const PRIVATE_QUESTION_PREFIX = "private/mr-know-it-all/questions/";

const EXCLUDED_RESEARCH_FIXTURES = new Set([
  "Hirono Mist Walker",
  "Buy using my account right now",
]);

const EXCLUDED_OWNER_VERIFICATION_TIMESTAMPS = new Set([
  "2026-09-17T10:27:05.239Z",
  "2026-09-17T10:27:30.679Z",
  "2026-09-17T10:27:33.251Z",
  "2026-09-17T10:35:23.502Z",
]);

export function redactQuestionForAnalytics(value) {
  return String(value ?? "")
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{16,}/gi, "[credential removed]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/gi, "[credential removed]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone removed]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[payment data removed]")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

export function buildPrivateQuestionEvent({ question, answer, now = new Date() }) {
  const redactedQuestion = redactQuestionForAnalytics(question);
  if (redactedQuestion.length < 3) throw new Error("Question is empty after private-data redaction");
  const citationDomains = [...new Set((answer?.citations ?? []).flatMap((citation) => {
    try {
      return [new URL(citation.url).hostname.toLowerCase()];
    } catch {
      return [];
    }
  }))].slice(0, 8);

  return {
    schema: PRIVATE_QUESTION_SCHEMA,
    recordedAt: now.toISOString(),
    question: redactedQuestion,
    answerMetadata: {
      confidence: ["high", "medium", "low"].includes(answer?.confidence) ? answer.confidence : "low",
      currentAsOf: answer?.currentAsOf ?? null,
      citationDomains,
    },
    identity: null,
    trackingPurpose: "owner-only aggregate knowledge-base, video, and affiliate demand analysis",
  };
}

export async function recordPrivateQuestion({
  question,
  answer,
  now = new Date(),
  token = process.env.MR_PRIVATE_BLOB_READ_WRITE_TOKEN,
  encryptionKey = process.env.MR_RESEARCH_ENCRYPTION_KEY,
  putImpl = put,
}) {
  if (!String(token ?? "").trim()) throw new Error("MR_PRIVATE_BLOB_READ_WRITE_TOKEN is required for private question tracking");
  if (!String(encryptionKey ?? "").trim()) throw new Error("MR_RESEARCH_ENCRYPTION_KEY is required for private question tracking");
  const event = buildPrivateQuestionEvent({ question, answer, now });
  const encrypted = encryptPrivateResearch(event, encryptionKey);
  const day = now.toISOString().slice(0, 10);
  const pathname = `${PRIVATE_QUESTION_PREFIX}${day}/${now.getTime()}-${crypto.randomUUID()}.json.enc`;
  const blob = await putImpl(pathname, encrypted, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60,
    contentType: "application/octet-stream",
    token,
  });
  return { pathname: blob.pathname ?? pathname, recordedAt: event.recordedAt };
}

function isEligibleSupabaseQuestionRow(row) {
  if (row?.source_mode !== "deterministic") return false;
  const question = String(row?.question_redacted ?? "").trim();
  if (EXCLUDED_RESEARCH_FIXTURES.has(question)) return false;
  const recordedAt = new Date(row?.created_at ?? "");
  if (Number.isNaN(recordedAt.getTime())) return true;
  return !EXCLUDED_OWNER_VERIFICATION_TIMESTAMPS.has(recordedAt.toISOString());
}

function mapSupabaseQuestionRow(row) {
  const question = String(row?.question_redacted ?? "").trim();
  const recordedAt = new Date(row?.created_at ?? "");
  if (question.length < 3 || Number.isNaN(recordedAt.getTime())) return null;
  const confidence = ["high", "medium", "low"].includes(row?.confidence) ? row.confidence : "low";
  return {
    schema: PRIVATE_QUESTION_SCHEMA,
    recordedAt: recordedAt.toISOString(),
    question,
    answerMetadata: {
      confidence,
      currentAsOf: null,
      citationDomains: [],
    },
    identity: null,
    trackingPurpose: "owner-only aggregate knowledge-base, video, and affiliate demand analysis",
  };
}

function requireSupabaseConfig({ supabaseUrl, serviceRoleKey }) {
  const url = String(supabaseUrl ?? "").trim().replace(/\/$/, "");
  const key = String(serviceRoleKey ?? "").trim();
  if (!url) throw new Error("SUPABASE_URL is required for private question analysis");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for private question analysis");
  try {
    return { url: new URL(url).origin, key };
  } catch {
    throw new Error("SUPABASE_URL is invalid for private question analysis");
  }
}

async function loadLegacyInjectedEvents({ listImpl, getImpl, token, encryptionKey, now, lookbackDays, maxEvents }) {
  // Test-only compatibility path retained until the separate Blob cleanup PR.
  if (!listImpl || !getImpl) return null;
  const { decryptPrivateResearch } = await import("./private-research-vault.mjs");
  const oldest = now.getTime() - lookbackDays * 86_400_000;
  const blobs = [];
  let scanned = 0;
  let cursor;
  do {
    const page = await listImpl({ prefix: PRIVATE_QUESTION_PREFIX, limit: 1_000, cursor, token });
    scanned += page.blobs?.length ?? 0;
    for (const blob of page.blobs ?? []) {
      const uploadedAt = new Date(blob.uploadedAt).getTime();
      if (blob.pathname?.endsWith(".json.enc") && uploadedAt >= oldest) blobs.push(blob);
    }
    cursor = page.hasMore && scanned < 5_000 ? page.cursor : undefined;
  } while (cursor);
  blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
  const selectedBlobs = blobs.slice(-maxEvents);
  const events = [];
  let skipped = 0;
  for (const blob of selectedBlobs) {
    try {
      const result = await getImpl(blob.url ?? blob.pathname, { access: "private", token, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        skipped += 1;
        continue;
      }
      const encrypted = await new Response(result.stream).text();
      const event = decryptPrivateResearch(encrypted, encryptionKey);
      if (event?.schema === PRIVATE_QUESTION_SCHEMA) events.push(event);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { events, skipped, excluded: 0, lookbackDays };
}

export async function loadPrivateQuestionEvents({
  supabaseUrl = process.env.SUPABASE_URL,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  now = new Date(),
  lookbackDays = 30,
  maxEvents = 500,
  fetchImpl = fetch,
  // Temporary explicit-injection compatibility for existing Blob unit tests only.
  listImpl,
  getImpl,
  token = process.env.MR_PRIVATE_BLOB_READ_WRITE_TOKEN,
  encryptionKey = process.env.MR_RESEARCH_ENCRYPTION_KEY,
} = {}) {
  if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) throw new Error("lookbackDays must be positive");
  if (!Number.isInteger(maxEvents) || maxEvents <= 0) throw new Error("maxEvents must be a positive integer");

  const legacy = await loadLegacyInjectedEvents({ listImpl, getImpl, token, encryptionKey, now, lookbackDays, maxEvents });
  if (legacy) return legacy;

  const { url, key } = requireSupabaseConfig({ supabaseUrl, serviceRoleKey });
  const oldest = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString();
  const eventsNewestFirst = [];
  let skipped = 0;
  let excluded = 0;
  let offset = 0;

  while (eventsNewestFirst.length < maxEvents) {
    const remaining = maxEvents - eventsNewestFirst.length;
    const limit = Math.min(1_000, Math.max(remaining, 100));
    const endpoint = new URL("/rest/v1/mr_know_it_all_questions", url);
    endpoint.searchParams.set("select", "id,question_redacted,created_at,confidence,source_mode");
    endpoint.searchParams.set("source_mode", "eq.deterministic");
    endpoint.searchParams.set("created_at", `gte.${oldest}`);
    endpoint.searchParams.set("order", "created_at.desc,id.desc");
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("limit", String(limit));

    let response;
    try {
      response = await fetchImpl(endpoint, {
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          accept: "application/json",
        },
      });
    } catch {
      throw new Error("Supabase private question query failed");
    }
    if (!response?.ok) throw new Error(`Supabase private question query failed with status ${response?.status ?? "unknown"}`);

    let rows;
    try {
      rows = await response.json();
    } catch {
      throw new Error("Supabase private question query returned invalid JSON");
    }
    if (!Array.isArray(rows)) throw new Error("Supabase private question query returned an invalid row set");

    for (const row of rows) {
      if (!isEligibleSupabaseQuestionRow(row)) {
        excluded += 1;
        continue;
      }
      const event = mapSupabaseQuestionRow(row);
      if (event) eventsNewestFirst.push(event);
      else skipped += 1;
      if (eventsNewestFirst.length >= maxEvents) break;
    }

    offset += rows.length;
    if (rows.length < limit) break;
  }

  return {
    events: eventsNewestFirst.slice(0, maxEvents).reverse(),
    skipped,
    excluded,
    lookbackDays,
  };
}
