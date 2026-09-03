import crypto from "node:crypto";

export const PARTNERSHIP_SCHEMA = "blindboxai.partnership-flywheel/v1";
export const PARTNERSHIP_STATE = "READY_FOR_REVIEW";
export const PARTNERSHIP_ROLES = Object.freeze({
  researcher: "Researcher",
  finder: "Finder",
  seeker: "Seeker",
});

const ALLOWED_TYPES = new Set([
  "sponsorship_discovery",
  "sponsorship_open_call",
  "affiliate",
  "ambassador_affiliate",
]);

const DEFAULT_FOCUS_TERMS = Object.freeze(["collectibles", "blind-box", "affiliate", "ambassador", "website"]);

const BASE_SCORE = Object.freeze({
  sponsorship_discovery: 100,
  sponsorship_open_call: 82,
  ambassador_affiliate: 62,
  affiliate: 55,
});

const BLOCKED_OUTREACH = [
  /\bguarantee(?:d|s)?\b/i,
  /\bofficial partner\b/i,
  /\bsponsored by\b/i,
  /\bendorsed by\b/i,
  /\bguaranteed (?:views|sales|revenue|roi)\b/i,
];

function httpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validatePartnershipOpportunity(opportunity, now = new Date()) {
  if (!opportunity?.id || !opportunity?.name || !opportunity?.organization) throw new Error("Partnership identity is required");
  if (!ALLOWED_TYPES.has(opportunity.type)) throw new Error(`${opportunity.id}: unsupported opportunity type`);
  if (!httpsUrl(opportunity.sourceUrl)) throw new Error(`${opportunity.id}: HTTPS sourceUrl is required`);
  const checked = Date.parse(opportunity.checkedAt);
  if (!Number.isFinite(checked)) throw new Error(`${opportunity.id}: checkedAt is invalid`);
  const age = now.getTime() - checked;
  if (age < 0 || age > 30 * 86400000) throw new Error(`${opportunity.id}: source is stale or future-dated`);
  if (!String(opportunity.evidence ?? "").trim()) throw new Error(`${opportunity.id}: evidence is required`);
  if (opportunity.eligibilityStatus !== "unknown" && opportunity.eligibilityStatus !== "verified") {
    throw new Error(`${opportunity.id}: eligibilityStatus must be unknown or verified`);
  }
  return opportunity;
}

export function partnershipScore(opportunity, { focusTerms = DEFAULT_FOCUS_TERMS } = {}) {
  validatePartnershipOpportunity(opportunity);
  let score = BASE_SCORE[opportunity.type] ?? 0;
  const tags = new Set((opportunity.fitTags ?? []).map((value) => String(value).toLowerCase()));
  for (const term of focusTerms.map((value) => String(value).toLowerCase())) if (tags.has(term)) score += 8;
  if (opportunity.eligibilityStatus === "unknown") score -= 8;
  const risks = new Set(opportunity.riskFlags ?? []);
  if (risks.has("ai-generated-visuals-may-be-rejected")) score -= 28;
  if (risks.has("affiliate-not-sponsorship")) score -= 8;
  if (risks.has("invite-only")) score -= 10;
  if (risks.has("eligibility-must-be-verified")) score -= 4;
  if (risks.has("approval-not-guaranteed") || risks.has("acceptance-not-guaranteed")) score -= 2;
  return score;
}

export function rankPartnershipOpportunities(opportunities, options = {}) {
  return (opportunities ?? [])
    .filter((opportunity) => opportunity?.active !== false)
    .map((opportunity) => ({ opportunity: validatePartnershipOpportunity(opportunity), score: partnershipScore(opportunity, options) }))
    .sort((a, b) => b.score - a.score || a.opportunity.id.localeCompare(b.opportunity.id));
}

export function assertPartnershipSafety(candidate) {
  if (candidate?.state !== PARTNERSHIP_STATE) throw new Error("Partnership candidate must stop at READY_FOR_REVIEW");
  if (candidate?.contactAutomatically !== false) throw new Error("Partnership seeker must not auto-contact prospects");
  if (candidate?.applyAutomatically !== false) throw new Error("Partnership seeker must not auto-apply");
  if (candidate?.spendAutomatically !== false) throw new Error("Partnership seeker must not spend money");
  if (candidate?.selected?.eligibilityStatus !== "unknown" && candidate?.selected?.eligibilityStatus !== "verified") {
    throw new Error("Eligibility must remain explicit");
  }
  const text = JSON.stringify(candidate.outreachBrief ?? {});
  for (const rule of BLOCKED_OUTREACH) if (rule.test(text)) throw new Error(`Partnership outreach contains blocked claim: ${rule}`);
  return candidate;
}

export function buildPartnershipCandidate(opportunities, { date = new Date(), focusTerms = DEFAULT_FOCUS_TERMS } = {}) {
  const ranked = rankPartnershipOpportunities(opportunities, { focusTerms });
  if (!ranked.length) throw new Error("No active verified partnership opportunities are available");
  const selected = ranked[0].opportunity;
  const id = crypto.createHash("sha256").update(`${date.toISOString().slice(0, 10)}:${selected.id}`).digest("hex").slice(0, 12);
  const candidate = {
    schema: PARTNERSHIP_SCHEMA,
    id: `${date.toISOString().slice(0, 10)}-${selected.id}-${id}`,
    state: PARTNERSHIP_STATE,
    roles: PARTNERSHIP_ROLES,
    contactAutomatically: false,
    applyAutomatically: false,
    spendAutomatically: false,
    selected: {
      id: selected.id,
      name: selected.name,
      organization: selected.organization,
      type: selected.type,
      sourceUrl: selected.sourceUrl,
      evidence: selected.evidence,
      requirements: selected.requirements ?? [],
      eligibilityStatus: selected.eligibilityStatus,
      riskFlags: selected.riskFlags ?? [],
      score: ranked[0].score,
    },
    shortlist: ranked.slice(0, 5).map(({ opportunity, score }) => ({
      id: opportunity.id,
      name: opportunity.name,
      organization: opportunity.organization,
      type: opportunity.type,
      eligibilityStatus: opportunity.eligibilityStatus,
      score,
      riskFlags: opportunity.riskFlags ?? [],
    })),
    researcher: {
      job: "Verify public program terms, freshness, eligibility requirements, content restrictions, payment model, and usage-rights risk before owner review.",
      nextChecks: ["eligibility", "current application/inquiry availability", "content/IP restrictions", "payment and usage rights", "fit with current BlindBoxAI audience"],
    },
    finder: {
      job: "Rank active verified opportunities by sponsorship or commission value, collectible fit, accessibility, and policy risk.",
      optimizeFor: "cash-or-commission opportunity without destabilizing the affiliate/video system",
    },
    seeker: {
      job: "Prepare a truthful owner-reviewed application or pitch only after eligibility and fit are verified.",
      status: "NO_CONTACT_SENT",
    },
    outreachBrief: {
      subject: `BlindBoxAI partnership fit: ${selected.organization}`,
      positioning: "BlindBoxAI creates evidence-backed collectible Buy-or-Pass content and routes interested visitors to transparent research and shopping paths.",
      proposedValue: "A clearly disclosed collectible-focused integration or campaign concept, with claims limited to verified evidence and agreed brand terms.",
      proofNeededBeforeSending: ["current site and social audience metrics", "audience geography where available", "recent relevant content performance", "verified eligibility", "brand-specific fit"],
    },
    createdAt: date.toISOString(),
  };
  return assertPartnershipSafety(candidate);
}

export function buildPartnershipPreview(candidate) {
  assertPartnershipSafety(candidate);
  return [
    `# Partnership Flywheel Review — ${candidate.selected.organization}`,
    "",
    `**State:** ${candidate.state}`,
    `**Selected:** ${candidate.selected.name}`,
    `**Type:** ${candidate.selected.type}`,
    `**Score:** ${candidate.selected.score}`,
    `**Eligibility:** ${candidate.selected.eligibilityStatus}`,
    "",
    "## Researcher",
    candidate.researcher.job,
    "",
    "## Finder",
    candidate.finder.job,
    "",
    "## Seeker",
    candidate.seeker.job,
    `Status: ${candidate.seeker.status}`,
    "",
    "## Evidence",
    candidate.selected.evidence,
    `Source: ${candidate.selected.sourceUrl}`,
    "",
    "## Guardrails",
    "- Review only; no autonomous email, DM, application, contract acceptance, or spend.",
    "- Inactive lanes are excluded from ranking and cannot be selected.",
    "- Affiliate/ambassador programs are not labeled as sponsorships.",
    "- Eligibility remains unknown until independently verified.",
    "- No guaranteed views, sales, revenue, or ROI claims.",
    "",
  ].join("\n");
}
