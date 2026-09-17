import crypto from "node:crypto";

const EDGE_PATH = "/functions/v1/mr-know-it-all-ingest";

const VERTICALS = [
  ["pokemon_tcg", /\b(pokemon|pokémon|pokemon tcg|pokémon tcg)\b/i],
  ["magic_the_gathering", /\b(magic(?: the gathering)?|mtg)\b/i],
  ["sports_cards", /\b(sports? cards?|baseball cards?|basketball cards?|football cards?|hockey cards?|soccer cards?|f1 cards?|ufc cards?|wrestling cards?|topps|panini|bowman)\b/i],
  ["yugioh", /\b(yu-?gi-?oh|yugioh)\b/i],
  ["one_piece", /\b(one piece(?: card game| tcg)?)\b/i],
  ["disney_lorcana", /\b(lorcana|disney lorcana)\b/i],
  ["pop_mart", /\b(pop mart|labubu|hirono|skullpanda|crybaby|dimoo|molly|pucky)\b/i],
  ["other_collectible_card", /\b(card|tcg|ccg)\b/i],
  ["other_collectible_toy", /\b(blind box|designer toy|vinyl figure|sofubi|funko|bearbrick|sonny angel|smiski|kidrobot|hot toys)\b/i],
];

export function classifyQuestionVertical(question) {
  const clean = String(question ?? "");
  return VERTICALS.find(([, pattern]) => pattern.test(clean))?.[0] ?? null;
}

export function hashResearchKey(value) {
  return crypto.createHash("sha256").update(String(value ?? "").trim().toLowerCase()).digest("hex");
}

export function redactQuestionForStorage(value) {
  return String(value ?? "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function automatedTestRuntime() {
  return process.env.NODE_ENV === "test" || process.env.CI === "true" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function testIngestAllowed() {
  return String(process.env.BLINDBOXAI_ALLOW_TEST_INGEST || "").trim().toLowerCase() === "true";
}

function config() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const ingestCode = String(process.env.EVIDENCE_UPLOAD_CODE || "").trim();
  return { url, ingestCode };
}

async function ingest(payload, fetchImpl = fetch) {
  if (automatedTestRuntime() && !testIngestAllowed()) {
    return { stored: false, reason: "test_recording_disabled" };
  }

  const { url, ingestCode } = config();
  if (!url) return { stored: false, reason: "supabase_url_missing" };
  if (!ingestCode) return { stored: false, reason: "ingest_authorization_missing" };

  const response = await fetchImpl(`${url}${EDGE_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mr-authorization": `Bearer ${ingestCode}`,
    },
    body: JSON.stringify(payload),
    redirect: "error",
  });
  if (!response.ok) return { stored: false, reason: `edge_${response.status}` };
  const body = await response.json().catch(() => ({}));
  return { stored: true, queued: Boolean(body?.queued) };
}

export async function recordKnowItAllQuestion({ question, result, fetchImpl = fetch }) {
  const redacted = redactQuestionForStorage(question);
  const questionHash = hashResearchKey(redacted);
  return ingest({
    type: "question",
    questionRedacted: redacted,
    questionHash,
    vertical: classifyQuestionVertical(redacted),
    intent: /\b(price|value|worth|sold|sale)\b/i.test(redacted) ? "valuation" : "general_research",
    resultCount: Array.isArray(result?.matches) ? result.matches.length : 0,
    answered: Boolean(result?.matches?.length),
    confidence: result?.confidence ?? null,
  }, fetchImpl);
}

export async function recordAudienceValuation({ question, rawOffer, gradedOffer, gradeAssumption, responderHash, sourcePlatform = "blindboxai", sourceContentId = null, sourceResponseId = null, fetchImpl = fetch }) {
  const queryKey = hashResearchKey(redactQuestionForStorage(question));
  return ingest({
    type: "audience_response",
    queryKey,
    rawOffer,
    gradedOffer,
    gradeAssumption,
    responderHash,
    sourcePlatform,
    sourceContentId,
    sourceResponseId,
  }, fetchImpl);
}
