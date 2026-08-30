import crypto from "node:crypto";
import {
  AFFILIATE_DISCLOSURE,
  BLINDBOXAI_URL,
  NARRATIVE_STATE,
} from "./narrative-flywheel.mjs";

export const UES_BUSINESS_NAME = "Ubiquitious Enlightened Services";
export const UES_NETWORK_SCHEMA = "blindboxai.ues-network-flywheel/v1";
export const UES_NETWORK_DISCLOSURE =
  "AI-assisted community and partnership prompt from Ubiquitious Enlightened Services; business results vary and participation creates no promised outcome.";

const RAW_MERCHANT_URL = /(?:https?:\/\/)?(?:www\.)?(?:ebay|amazon)\.[^\s/]+/i;
const BLOCKED_PROMISE_LANGUAGE = [
  /\bguarantee(?:d|s)?\b/i,
  /\bget rich\b/i,
  /\bfinancial advice\b/i,
  /\binvest(?:ment|or|ing)?\b/i,
  /\bguaranteed return\b/i,
  /\brisk[- ]?free\b/i,
  /\binstant money\b/i,
  /\bviral guaranteed\b/i,
];

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function assertUesNetworkSafety(candidate) {
  if (candidate?.state !== NARRATIVE_STATE) {
    throw new Error("UES network candidate must stop at READY_FOR_REVIEW");
  }
  if (candidate?.publicCta !== BLINDBOXAI_URL) {
    throw new Error("UES network public CTA must remain BlindBoxAI");
  }
  if (candidate?.publishAutomatically !== false) {
    throw new Error("UES network candidate must not auto-publish");
  }

  const publicText = `${candidate?.hook ?? ""}\n${candidate?.caption ?? ""}`;
  if (!publicText.includes(UES_BUSINESS_NAME)) {
    throw new Error("UES business identity is required");
  }
  if (!publicText.includes(UES_NETWORK_DISCLOSURE)) {
    throw new Error("UES network disclosure is required");
  }
  if (!publicText.includes(AFFILIATE_DISCLOSURE)) {
    throw new Error("Affiliate disclosure is required");
  }
  if (RAW_MERCHANT_URL.test(publicText)) {
    throw new Error("UES network public copy must not contain raw merchant URLs");
  }
  for (const rule of BLOCKED_PROMISE_LANGUAGE) {
    if (rule.test(publicText)) {
      throw new Error(`UES network public copy contains blocked promise language: ${rule}`);
    }
  }
  return candidate;
}

export function buildUesNetworkCandidate({ date = new Date() } = {}) {
  const key = dateKey(date);
  const digest = crypto.createHash("sha256").update(`${key}:${UES_BUSINESS_NAME}:network`).digest("hex");
  const conversationPrompts = [
    "What useful product, audience, business opportunity, collectible signal, automation idea, or distribution problem should this network examine next?",
    "Which creator, buyer, builder, collector, or business should be connected because both sides can create measurable value together?",
    "What useful introduction could turn an overlooked product, project, or expertise into a real collaboration?",
    "What business bottleneck could practical AI automation remove without giving the system unnecessary authority?",
  ];
  const prompt = conversationPrompts[Number.parseInt(digest.slice(0, 8), 16) % conversationPrompts.length];
  const hook = "Connections create opportunities. Useful connections create measurable value.";
  const caption = [
    hook,
    "",
    `${UES_BUSINESS_NAME} is building a network around creators, collectors, builders, buyers, partners, and practical AI automation.`,
    "",
    `Mr Know It All asks: ${prompt}`,
    "",
    "Bring evidence. Bring a useful introduction. Bring a problem worth solving. The goal is a connection where every participant can understand the value being exchanged.",
    "",
    `Explore the collector intelligence layer: ${BLINDBOXAI_URL}`,
    UES_NETWORK_DISCLOSURE,
    AFFILIATE_DISCLOSURE,
  ].join("\n");

  const candidate = {
    schema: UES_NETWORK_SCHEMA,
    id: `${key}-ues-network-${digest.slice(0, 8)}`,
    state: NARRATIVE_STATE,
    persona: "Mr Know It All",
    kind: "ues-network-connection",
    business: UES_BUSINESS_NAME,
    hook,
    caption,
    publicCta: BLINDBOXAI_URL,
    publishAutomatically: false,
    campaign: {
      id: `ues-network-${key}`,
      source: "mr-know-it-all",
      purpose: "qualified_connections",
    },
    connectionTargets: [
      "qualified buyer introductions",
      "affiliate partnerships",
      "creator and distribution partnerships",
      "automation collaborations",
      "collector intelligence contributions",
    ],
    feedbackPlan: {
      measure: ["qualified_replies", "referrals", "blindboxai_clicks", "saves", "comments"],
      optimizeFor: "qualified_conversations_referrals_and_blindboxai_clicks",
      rule: "Use measured response patterns to improve future prompts; never fabricate demand, endorsements, scarcity, revenue, or promised outcomes.",
    },
    disclosures: {
      network: UES_NETWORK_DISCLOSURE,
      affiliate: AFFILIATE_DISCLOSURE,
    },
    createdAt: date.toISOString(),
  };

  return assertUesNetworkSafety(candidate);
}

export function buildUesNetworkPreview(candidate) {
  assertUesNetworkSafety(candidate);
  return [
    `# UES Network Connection Review — ${candidate.id}`,
    "",
    `**State:** ${candidate.state}`,
    `**Persona:** ${candidate.persona}`,
    `**Business:** ${candidate.business}`,
    `**Campaign:** ${candidate.campaign.id}`,
    "",
    "## Proposed public copy",
    "",
    candidate.caption,
    "",
    "## Intended connections",
    "",
    ...candidate.connectionTargets.map((item) => `- ${item}`),
    "",
    "## Guardrails",
    "",
    "- Review only; no autonomous publish.",
    "- No spending or payment authority.",
    "- No raw merchant URL in public copy.",
    "- No fabricated demand, endorsements, scarcity, revenue, or promised outcomes.",
    "- Public CTA remains BlindBoxAI.",
    "",
  ].join("\n");
}
