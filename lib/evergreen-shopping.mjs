import crypto from "node:crypto";

export const SHOPPING_SCHEMA = "blindboxai.evergreen-shopping-opportunities/v1";
export const SHOPPING_CANDIDATE_SCHEMA = "blindboxai.shopping-candidate/v1";
export const SHOPPING_DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";
export const BLINDBOXAI_URL = "https://www.blindboxai.com";

const clean = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
};

export function validateShoppingConfig(config) {
  if (config?.schema !== SHOPPING_SCHEMA) throw new Error("Evergreen shopping schema is invalid");
  if (!Array.isArray(config.opportunities) || !config.opportunities.length) throw new Error("At least one evergreen shopping opportunity is required");
  if (config?.channelRules?.publicCta !== BLINDBOXAI_URL) throw new Error("Public CTA must remain BlindBoxAI");
  if (config?.channelRules?.merchantLinksInPublicCopy !== false) throw new Error("Merchant URLs must not be embedded in public copy");
  if (config?.channelRules?.approvalRequiredBeforePublish !== true) throw new Error("Manual approval must remain required");
  for (const item of config.opportunities) {
    clean(item.id, "opportunity.id");
    clean(item.name, `${item.id}.name`);
    clean(item.intent, `${item.id}.intent`);
    clean(item.amazonSearchTerm, `${item.id}.amazonSearchTerm`);
    if (!Array.isArray(item.contentAngles) || item.contentAngles.length < 2) throw new Error(`${item.id}: at least two content angles are required`);
    if (!Number.isFinite(Number(item.evergreenScore)) || !Number.isFinite(Number(item.buyerIntentScore))) throw new Error(`${item.id}: numeric scores are required`);
  }
  return config;
}

export function scoreOpportunity(item) {
  return Number(item.evergreenScore) * 0.55 + Number(item.buyerIntentScore) * 0.45;
}

export function rankShoppingOpportunities(config) {
  validateShoppingConfig(config);
  return config.opportunities.slice().sort((a, b) => {
    const delta = scoreOpportunity(b) - scoreOpportunity(a);
    return delta || String(a.id).localeCompare(String(b.id));
  });
}

export function selectShoppingOpportunity(config, date = new Date()) {
  const ranked = rankShoppingOpportunities(config);
  const week = `${date.getUTCFullYear()}-${String(Math.ceil((((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)).padStart(2, "0")}`;
  const digest = crypto.createHash("sha256").update(week).digest("hex");
  const poolSize = Math.min(3, ranked.length);
  return ranked[Number.parseInt(digest.slice(0, 8), 16) % poolSize];
}

export function buildShoppingCandidate(config, { date = new Date(), amazonEligible = false, youtubeShoppingEligible = false } = {}) {
  const item = selectShoppingOpportunity(config, date);
  const angleIndex = Number.parseInt(crypto.createHash("sha256").update(`${date.toISOString().slice(0, 10)}:${item.id}`).digest("hex").slice(0, 8), 16) % item.contentAngles.length;
  const angle = item.contentAngles[angleIndex];
  const publicCaption = `${angle}\n\nCollector tools and research: ${BLINDBOXAI_URL}\n\n${SHOPPING_DISCLOSURE}`;
  if (/amazon\.(?:com|to)\//i.test(publicCaption)) throw new Error("Public caption must not contain merchant URLs");
  return {
    schema: SHOPPING_CANDIDATE_SCHEMA,
    id: `${date.toISOString().slice(0, 10)}-${item.id}`,
    state: "READY_FOR_REVIEW",
    opportunityId: item.id,
    title: angle,
    intent: item.intent,
    publicCaption,
    productTagging: {
      provider: "amazon",
      searchTerm: item.amazonSearchTerm,
      youtubeTaggingRequested: item.youtubeTagging === true,
      accountEligibility: {
        amazon: Boolean(amazonEligible),
        youtubeShopping: Boolean(youtubeShoppingEligible),
      },
      ready: Boolean(amazonEligible && youtubeShoppingEligible && item.youtubeTagging === true),
      rule: "Use channel-native YouTube Shopping product tags only after eligibility is confirmed. Never replace the BlindBoxAI public CTA with a raw merchant URL."
    },
    approvedAt: null,
    createdAt: date.toISOString()
  };
}
