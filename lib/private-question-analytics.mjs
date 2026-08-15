import crypto from "node:crypto";

import { get, list, put } from "@vercel/blob";

import {
  decryptPrivateResearch,
  encryptPrivateResearch,
} from "./private-research-vault.mjs";

export const PRIVATE_QUESTION_SCHEMA = "blindboxai/private-question-demand/v1";
export const PRIVATE_QUESTION_PREFIX = "private/mr-know-it-all/questions/";

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

async function streamText(result) {
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}

export async function loadPrivateQuestionEvents({
  token = process.env.MR_PRIVATE_BLOB_READ_WRITE_TOKEN,
  encryptionKey = process.env.MR_RESEARCH_ENCRYPTION_KEY,
  now = new Date(),
  lookbackDays = 30,
  maxEvents = 500,
  listImpl = list,
  getImpl = get,
}) {
  if (!String(token ?? "").trim()) throw new Error("MR_PRIVATE_BLOB_READ_WRITE_TOKEN is required for private question analysis");
  if (!String(encryptionKey ?? "").trim()) throw new Error("MR_RESEARCH_ENCRYPTION_KEY is required for private question analysis");
  const oldest = now.getTime() - lookbackDays * 86_400_000;
  const blobs = [];
  let scanned = 0;
  let cursor;

  do {
    const page = await listImpl({
      prefix: PRIVATE_QUESTION_PREFIX,
      limit: 1_000,
      cursor,
      token,
    });
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
  for (let index = 0; index < selectedBlobs.length; index += 10) {
    const batch = selectedBlobs.slice(index, index + 10);
    const loaded = await Promise.all(batch.map(async (blob) => {
      try {
        const result = await getImpl(blob.url ?? blob.pathname, {
          access: "private",
          token,
          useCache: false,
        });
        const encrypted = await streamText(result);
        if (!encrypted) return null;
        const event = decryptPrivateResearch(encrypted, encryptionKey);
        return event?.schema === PRIVATE_QUESTION_SCHEMA ? event : null;
      } catch {
        return null;
      }
    }));
    for (const event of loaded) {
      if (event) events.push(event);
      else skipped += 1;
    }
  }

  return { events, skipped, lookbackDays };
}
