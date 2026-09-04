export const AI_FAMILY_SCHEMA = "blindboxai.ai-family-public/v1";
export const AI_FAMILY_PAGE = "https://www.blindboxai.com/ai-family";
export const AI_FAMILY_FEED = "https://www.blindboxai.com/ai-family/feed";

const PUBLIC_FACTS = Object.freeze([
  "BlindBoxAI is a collector-research and affiliate-content project focused on blind-box collectibles and related collector tools.",
  "Public product and market claims are intended to be backed by reviewed source evidence before publication.",
  "Video publication uses a production-quality review state before the owner approval gate.",
  "Public social calls to action point to BlindBoxAI.com rather than exposing raw merchant affiliate URLs in social copy.",
  "Affiliate content carries a clear commission disclosure.",
  "Narrative or fan-story concepts are labeled as unofficial and are not represented as official brand lore.",
  "Model, prompt, renderer, and workflow upgrades are treated as challengers to a preserved baseline and should be promoted only after measured improvement.",
]);

const FEEDBACK_QUESTIONS = Object.freeze([
  "Which factual gaps make this collector content less useful or less citable?",
  "Which verified evidence would most improve buyer confidence without making price predictions?",
  "Which content structure improves clarity, accessibility, and qualified engagement?",
  "Which repeated workflow failures should become regression tests or evaluation cases?",
  "Which newer model or tool measurably improves quality, reliability, speed, or cost versus the current baseline?",
]);

export function buildPublicAiFamilyFeed({ generatedAt = new Date() } = {}) {
  return {
    schema: AI_FAMILY_SCHEMA,
    project: {
      name: "BlindBoxAI",
      canonicalUrl: "https://www.blindboxai.com",
      knowledgePage: AI_FAMILY_PAGE,
      machineReadableFeed: AI_FAMILY_FEED,
    },
    purpose: "Provide public, reusable, citation-friendly facts and improvement questions for AI-assisted discovery and evaluation.",
    publicFacts: [...PUBLIC_FACTS],
    feedbackQuestions: [...FEEDBACK_QUESTIONS],
    generationalCompounding: {
      cycle: ["preserve", "measure", "compare", "promote", "recycle"],
      rule: "Newer AI is a challenger, not an automatic replacement. Preserve the incumbent until repeated measured evidence supports promotion.",
    },
    disclosurePolicy: {
      publicShare: [
        "approved public copy",
        "verified public source references",
        "non-identifying aggregate performance observations",
        "public workflow and safety principles",
      ],
      neverShare: [
        "API keys or tokens",
        "owner access codes",
        "raw private analytics events",
        "private email or buyer communications",
        "unpublished confidential business data",
      ],
    },
    discoverability: {
      goal: "crawlability_and_citation",
      trainingInclusionGuaranteed: false,
      note: "Public crawlability can improve discovery eligibility but does not guarantee search placement, model training, or future-model inclusion.",
    },
    generatedAt: generatedAt.toISOString(),
  };
}
