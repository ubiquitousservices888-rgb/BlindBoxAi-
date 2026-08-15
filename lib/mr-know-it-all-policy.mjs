export const AGENT_NAME = "Mr. Know It All";
export const QUESTION_MAX_LENGTH = 600;
export const RESEARCH_SCHEMA = "blindboxai/mr-know-it-all-research/v1";

export const OPPORTUNITY_TYPES = Object.freeze([
  "knowledge-base",
  "affiliate",
  "video",
]);

export const OPPORTUNITY_STATUSES = Object.freeze({
  RESEARCH_ONLY: "RESEARCH_ONLY",
  READY: "READY_FOR_OWNER_REVIEW",
  REJECTED: "REJECTED",
});

const SOURCE_KINDS = new Set([
  "official-brand",
  "official-product",
  "affiliate-program",
  "transaction-marketplace",
  "market-signal",
]);

const MONETIZATION_PATHS = new Set([
  "existing-ebay-epn",
  "direct-brand-affiliate",
  "knowledge-base-conversion",
  "owned-media-video",
]);

const SIDE_EFFECT_REQUEST = /\b(?:buy|purchase|bid|checkout|pay|send|email|dm|contact|message|publish|post|upload|enroll|sign\s*up)\b[\s\S]{0,100}\b(?:for me|on my behalf|using my account|right now|automatically)\b/i;
const SECRET_REQUEST = /\b(?:show|reveal|print|dump|expose|return|repeat)\b[\s\S]{0,80}\b(?:system prompt|developer message|api key|secret|token|environment variable|credentials?)\b/i;
const BYPASS_REQUEST = /\b(?:ignore|override|bypass|disable|evade)\b[\s\S]{0,80}\b(?:instruction|guardrail|safety|policy|approval|restriction)\b/i;
const PROHIBITED_CLAIM = /\b(?:guaranteed profit|profit guaranteed|risk[- ]free|zero risk|sure(?:fire)? win|cannot lose|will definitely (?:rise|increase|appreciate))\b/i;
const SECRET_PATTERN = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function cleanText(value, maxLength = 600) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function ageDays(value, now) {
  const timestamp = new Date(value).getTime();
  return (now.getTime() - timestamp) / 86_400_000;
}

function unique(values) {
  return [...new Set(values)];
}

export function validateQuestion(value) {
  const question = cleanText(value, QUESTION_MAX_LENGTH + 1);
  if (question.length < 3) throw new Error("Please ask a complete blind-box question.");
  if (question.length > QUESTION_MAX_LENGTH) {
    throw new Error(`Questions must be ${QUESTION_MAX_LENGTH} characters or fewer.`);
  }
  if (SECRET_REQUEST.test(question) || BYPASS_REQUEST.test(question)) {
    throw new Error("I cannot reveal private instructions, credentials, or bypass safety controls.");
  }
  if (SIDE_EFFECT_REQUEST.test(question)) {
    throw new Error("I can explain or prepare a draft, but I cannot transact, contact, or publish on your behalf.");
  }
  return question;
}

export function assertNoUnsafeClaims(value, label = "content") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (PROHIBITED_CLAIM.test(text)) {
    throw new Error(`${label} contains a profit or risk guarantee`);
  }
  if (SECRET_PATTERN.test(text)) throw new Error(`${label} contains a credential-like value`);
  return true;
}

export function normalizeAnswer(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Agent returned no structured answer");
  const answer = cleanText(raw.answer, 4_000);
  if (!answer) throw new Error("Agent returned an empty answer");
  assertNoUnsafeClaims(answer, "answer");

  const citations = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.citations) ? raw.citations : []) {
    const url = httpsUrl(item?.url);
    if (!url || seen.has(url) || citations.length >= 8) continue;
    seen.add(url);
    citations.push({
      title: cleanText(item?.title, 160) || new URL(url).hostname,
      url,
      supports: cleanText(item?.supports, 300),
    });
  }

  let confidence = ["high", "medium", "low"].includes(raw.confidence)
    ? raw.confidence
    : "low";
  const currentAsOf = raw.currentAsOf ? isoDate(raw.currentAsOf) : null;
  const safetyNotes = unique((Array.isArray(raw.safetyNotes) ? raw.safetyNotes : [])
    .map((item) => cleanText(item, 300))
    .filter(Boolean))
    .slice(0, 4);

  if (currentAsOf && citations.length === 0) {
    confidence = "low";
    safetyNotes.push("Current information was not returned with a verifiable source; confirm it before acting.");
  }

  return {
    answer,
    confidence,
    currentAsOf,
    citations,
    safetyNotes: unique(safetyNotes).slice(0, 4),
    suggestedQuestions: unique((Array.isArray(raw.suggestedQuestions) ? raw.suggestedQuestions : [])
      .map((item) => cleanText(item, 160))
      .filter(Boolean))
      .slice(0, 3),
  };
}

function normalizeEvidence(raw, now) {
  const url = httpsUrl(raw?.url);
  const kind = SOURCE_KINDS.has(raw?.kind) ? raw.kind : null;
  const observedAt = isoDate(raw?.observedAt);
  const title = cleanText(raw?.title, 180);
  const claim = cleanText(raw?.claim, 500);
  if (!url || !kind || !observedAt || !title || !claim) return null;

  const daysOld = ageDays(observedAt, now);
  const maxAge = kind === "transaction-marketplace" ? 45
    : kind === "market-signal" ? 30
      : 180;

  return {
    title,
    url,
    kind,
    observedAt,
    claim,
    fresh: daysOld >= -1 && daysOld <= maxAge,
  };
}

function normalizeTransactions(raw) {
  if (!raw || typeof raw !== "object") return null;
  const low = Number(raw.observedLowUSD);
  const high = Number(raw.observedHighUSD);
  const sampleSize = Number(raw.sampleSize);
  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isInteger(sampleSize)) return null;
  if (low <= 0 || high < low || sampleSize < 1) return null;
  return {
    currency: "USD",
    observedLowUSD: low,
    observedHighUSD: high,
    sampleSize,
    caveat: cleanText(raw.caveat, 400),
  };
}

function opportunityId(candidate) {
  return [candidate.type, candidate.brand, candidate.series, candidate.title]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function normalizeAudienceDemand(raw, totalQuestionCount) {
  const count = Number(raw?.count);
  return {
    theme: cleanText(raw?.theme, 180),
    userNeed: cleanText(raw?.userNeed, 400),
    count: Number.isInteger(count) ? clamp(count, 0, totalQuestionCount) : 0,
  };
}

export function evaluateOpportunity(raw, now = new Date(), options = {}) {
  const totalQuestionCount = Number.isInteger(options.totalQuestionCount)
    ? Math.max(0, options.totalQuestionCount)
    : Number.MAX_SAFE_INTEGER;
  const type = OPPORTUNITY_TYPES.includes(raw?.type) ? raw.type : null;
  const brand = cleanText(raw?.brand, 120);
  const series = cleanText(raw?.series, 160);
  const title = cleanText(raw?.title, 180);
  const whyNow = cleanText(raw?.whyNow, 600);
  const proposedAction = cleanText(raw?.proposedAction, 600);
  const monetizationPath = MONETIZATION_PATHS.has(raw?.monetizationPath)
    ? raw.monetizationPath
    : null;
  const programUrl = raw?.programUrl ? httpsUrl(raw.programUrl) : null;
  const transactions = normalizeTransactions(raw?.positiveUsdTransactions);
  const audienceDemand = normalizeAudienceDemand(raw?.audienceDemand, totalQuestionCount);
  const risks = unique((Array.isArray(raw?.risks) ? raw.risks : [])
    .map((item) => cleanText(item, 300))
    .filter(Boolean))
    .slice(0, 8);

  const evidence = [];
  const seenUrls = new Set();
  for (const item of Array.isArray(raw?.evidence) ? raw.evidence : []) {
    const normalized = normalizeEvidence(item, now);
    if (!normalized || seenUrls.has(normalized.url) || evidence.length >= 8) continue;
    seenUrls.add(normalized.url);
    evidence.push(normalized);
  }

  const reasons = [];
  const combined = [title, whyNow, proposedAction, ...risks, ...evidence.map((item) => item.claim)].join("\n");
  if (!type || !brand || !series || !title) reasons.push("identity or opportunity type is incomplete");
  const allowedPaths = {
    "knowledge-base": ["knowledge-base-conversion"],
    affiliate: ["existing-ebay-epn", "direct-brand-affiliate"],
    video: ["owned-media-video"],
  };
  if (type && !allowedPaths[type]?.includes(monetizationPath)) {
    reasons.push("opportunity type and monetization path mismatch");
  }
  if (!whyNow || !proposedAction) reasons.push("timing or proposed action is incomplete");
  if (PROHIBITED_CLAIM.test(combined)) reasons.push("profit or risk-free guarantee detected");
  if (!monetizationPath) reasons.push("monetization path is not approved");
  if (!transactions) reasons.push("positive USD transaction evidence is missing or invalid");
  if (evidence.length < 2) reasons.push("fewer than two distinct source URLs");
  if (evidence.some((item) => !item.fresh)) reasons.push("one or more sources exceed the freshness window");
  if (audienceDemand.count < 2) reasons.push("fewer than two matching private questions");

  const hasOfficial = evidence.some((item) => ["official-brand", "official-product"].includes(item.kind));
  const hasTransactionSource = evidence.some((item) => item.kind === "transaction-marketplace");
  const hasProgramSource = evidence.some((item) => item.kind === "affiliate-program");
  if (!hasOfficial) reasons.push("official brand or product evidence is missing");
  if (!hasTransactionSource) reasons.push("transaction marketplace source is missing");
  if (monetizationPath === "direct-brand-affiliate" && (!hasProgramSource || !programUrl)) {
    reasons.push("official program evidence is missing");
  }

  const sampleSize = transactions?.sampleSize ?? 0;
  const evidenceStrength = clamp(
    (hasOfficial ? 15 : 0) +
    (hasTransactionSource ? 20 : 0) +
    (hasProgramSource || monetizationPath === "existing-ebay-epn" ? 10 : 0) +
    (evidence.length >= 3 ? 5 : 0),
    0,
    50,
  );
  const monetizationFit = clamp(
    (monetizationPath ? 15 : 0) +
    (transactions ? 10 : 0) +
    (proposedAction ? 5 : 0),
    0,
    30,
  );
  const executionReadiness = clamp(
    (brand && series ? 5 : 0) +
    (whyNow ? 5 : 0) +
    (evidence.length > 0 && evidence.every((item) => item.fresh) ? 5 : 0) +
    (audienceDemand.count >= 2 ? 5 : 0),
    0,
    20,
  );

  const hardBlock = reasons.some((reason) => /guarantee|identity|monetization path|official program|official brand|transaction marketplace|positive USD/.test(reason));
  const riskLevel = hardBlock ? "high"
    : sampleSize < 3 || evidence.length < 3 || risks.length > 3 || audienceDemand.count < 2 ? "medium"
      : "low";
  const riskPenalty = riskLevel === "high" ? 40 : riskLevel === "medium" ? 15 : 5;
  const score = clamp(evidenceStrength + monetizationFit + executionReadiness - riskPenalty, 0, 100);
  const status = riskLevel === "high"
    ? OPPORTUNITY_STATUSES.REJECTED
    : riskLevel === "low" && score >= 70
      ? OPPORTUNITY_STATUSES.READY
      : OPPORTUNITY_STATUSES.RESEARCH_ONLY;

  const candidate = {
    id: "",
    type: type ?? "unknown",
    brand,
    series,
    title,
    whyNow,
    proposedAction,
    monetizationPath,
    programUrl,
    positiveUsdTransactions: transactions,
    audienceDemand,
    evidence,
    risks,
    evaluation: {
      status,
      riskLevel,
      score,
      evidenceStrength,
      monetizationFit,
      executionReadiness,
      reasons: unique(reasons),
      humanApprovalRequired: true,
      profitGuaranteed: false,
      riskFree: false,
    },
  };
  candidate.id = opportunityId(candidate) || `candidate-${now.getTime()}`;
  assertNoUnsafeClaims(candidate, "opportunity");
  return candidate;
}

export function buildResearchArtifact(raw, now = new Date(), metadata = {}) {
  if (!raw || typeof raw !== "object") throw new Error("Agent returned no structured research");
  const totalQuestionCount = Number.isInteger(metadata.questionCount) ? Math.max(0, metadata.questionCount) : 0;
  const opportunities = (Array.isArray(raw.opportunities) ? raw.opportunities : [])
    .slice(0, 12)
    .map((item) => evaluateOpportunity(item, now, { totalQuestionCount }));

  const themes = (Array.isArray(raw.questionThemes) ? raw.questionThemes : [])
    .slice(0, 12)
    .map((theme) => ({
      topic: cleanText(theme?.topic, 180),
      userNeed: cleanText(theme?.userNeed, 400),
      count: clamp(Number.isInteger(theme?.count) ? theme.count : 0, 0, totalQuestionCount),
    }))
    .filter((theme) => theme.topic && theme.userNeed && theme.count > 0);

  const artifact = {
    schema: RESEARCH_SCHEMA,
    agent: AGENT_NAME,
    mode: "twice-daily-research",
    researchedAt: now.toISOString(),
    scope: "all blind-box toys and collectibles; no brand allowlist",
    summary: cleanText(raw.summary, 1_500),
    humanApprovalRequired: true,
    sideEffectsPerformed: [],
    model: cleanText(metadata.model, 80) || null,
    privateQuestionAnalysis: {
      lookbackDays: Number.isInteger(metadata.questionLookbackDays) ? metadata.questionLookbackDays : 30,
      analyzedQuestionCount: totalQuestionCount,
      unreadableEncryptedEvents: Number.isInteger(metadata.skippedQuestionEvents) ? metadata.skippedQuestionEvents : 0,
      summary: cleanText(raw.demandSummary, 1_500),
      themes,
      storesIdentity: false,
    },
    opportunities,
    counts: {
      readyForOwnerReview: opportunities.filter((item) => item.evaluation.status === OPPORTUNITY_STATUSES.READY).length,
      researchOnly: opportunities.filter((item) => item.evaluation.status === OPPORTUNITY_STATUSES.RESEARCH_ONLY).length,
      rejected: opportunities.filter((item) => item.evaluation.status === OPPORTUNITY_STATUSES.REJECTED).length,
    },
    disclaimers: [
      "Observed transactions and affiliate paths do not guarantee profit, demand, or future value.",
      "No purchase, enrollment, outreach, rendering, or publishing occurs without owner approval.",
    ],
  };
  assertResearchArtifact(artifact);
  return artifact;
}

export function assertResearchArtifact(artifact) {
  if (artifact?.schema !== RESEARCH_SCHEMA) throw new Error("Research artifact schema is invalid");
  if (artifact?.agent !== AGENT_NAME || artifact?.humanApprovalRequired !== true) {
    throw new Error("Research artifact approval contract is invalid");
  }
  if (!Array.isArray(artifact.sideEffectsPerformed) || artifact.sideEffectsPerformed.length !== 0) {
    throw new Error("Research artifact must not record external side effects");
  }
  if (artifact?.privateQuestionAnalysis?.storesIdentity !== false) {
    throw new Error("Private question analysis must not store visitor identity");
  }
  for (const opportunity of artifact.opportunities ?? []) {
    if (!Object.values(OPPORTUNITY_STATUSES).includes(opportunity?.evaluation?.status)) {
      throw new Error("Research opportunity status is invalid");
    }
    if (opportunity?.evaluation?.humanApprovalRequired !== true) {
      throw new Error("Every opportunity requires human approval");
    }
    if (opportunity?.evaluation?.profitGuaranteed || opportunity?.evaluation?.riskFree) {
      throw new Error("Research opportunity cannot claim guaranteed profit or zero risk");
    }
  }
  assertNoUnsafeClaims(artifact, "research artifact");
  return true;
}
