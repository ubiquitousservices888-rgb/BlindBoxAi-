import crypto from "node:crypto";

export const NARRATIVE_SCHEMA = "blindboxai.narrative-flywheel/v1";
export const NARRATIVE_STATE = "READY_FOR_REVIEW";
export const BLINDBOXAI_URL = "https://www.blindboxai.com";
export const AFFILIATE_DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";
export const FAN_STORY_DISCLOSURE = "AI-generated BlindBoxAI fan-story concept; not official brand lore.";

const BLOCKED_FINANCIAL_LANGUAGE = [
  /\bguarantee(?:d|s)?\b/i,
  /\bget rich\b/i,
  /\bmoon(?:ing)?\b/i,
  /\bpump\b/i,
  /\bprofit(?:s|able)?\b/i,
  /\binvest(?:ment|or|ing)?\b/i,
  /\bfinancial advice\b/i,
  /\bbuy now before\b/i,
  /\bwill (?:rise|increase|double|triple|explode)\b/i,
];

const RAW_MERCHANT_URL = /https?:\/\/(?:www\.)?(?:ebay|amazon)\.[^\s/]+\//i;

const HOOK_FAMILIES = [
  {
    id: "collector-signal",
    build: ({ seriesName, figureName }) =>
      `Collector signal: ${figureName} from ${seriesName} has verified completed-sale evidence. What detail makes this character memorable enough for collectors to keep watching?`,
  },
  {
    id: "mystery-thread",
    build: ({ seriesName, figureName }) =>
      `Mystery thread: ${figureName} is one verified piece of the ${seriesName} collector story. The question is not what it will be worth—it is why this design keeps earning attention.`,
  },
  {
    id: "fan-lore",
    build: ({ seriesName, figureName }) =>
      `BlindBoxAI fan-lore seed: imagine ${figureName} as the quiet signal hidden inside ${seriesName}—the character collectors notice only after they learn what to look for.`,
  },
  {
    id: "collector-debate",
    build: ({ seriesName, figureName }) =>
      `Collector debate: if you could keep only one detail from ${figureName} in ${seriesName}, which one defines the character—the expression, the theme, or the rarity story?`,
  },
];

function clean(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function safeEvidence(series) {
  const figures = Array.isArray(series?.figures) ? series.figures : [];
  return figures.filter((figure) => {
    return figure?.needsReview !== true && String(figure?.evidence ?? "").trim().length > 0;
  });
}

export function validateNarrativeSeries(series) {
  clean(series?.slug, "series.slug");
  clean(series?.name, "series.name");
  clean(series?.brand, "series.brand");
  if (series?.marketSelection?.completedSalesStatus !== "verified") {
    throw new Error(`${series.slug}: completed sales must be verified`);
  }
  if (!safeEvidence(series).length) {
    throw new Error(`${series.slug}: at least one reviewed evidence-backed figure is required`);
  }
  return series;
}

export function narrativePriority(series, priorityTerms = ["twinkle"]) {
  validateNarrativeSeries(series);
  const haystack = `${series.slug} ${series.name} ${series.brand} ${series?.marketSelection?.priorityIp ?? ""}`.toLowerCase();
  const terms = (Array.isArray(priorityTerms) ? priorityTerms : [])
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
  const termIndex = terms.findIndex((term) => haystack.includes(term));
  if (termIndex >= 0) return termIndex;
  const explicit = Number(series?.automationPriority);
  if (Number.isFinite(explicit)) return 100 + explicit;
  return 10_000;
}

export function selectNarrativeSeries(seriesList, { priorityTerms = ["twinkle"] } = {}) {
  const eligible = (Array.isArray(seriesList) ? seriesList : [])
    .filter((series) => {
      try {
        validateNarrativeSeries(series);
        return true;
      } catch {
        return false;
      }
    })
    .slice();

  eligible.sort((a, b) => {
    const delta = narrativePriority(a, priorityTerms) - narrativePriority(b, priorityTerms);
    return delta || String(a.slug).localeCompare(String(b.slug));
  });
  return eligible[0] ?? null;
}

function hookFamilyForDate(series, date = new Date()) {
  const seed = `${date.toISOString().slice(0, 10)}:${series.slug}`;
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  return HOOK_FAMILIES[Number.parseInt(digest.slice(0, 8), 16) % HOOK_FAMILIES.length];
}

export function assertNarrativeSafety(candidate) {
  if (candidate?.state !== NARRATIVE_STATE) throw new Error("Narrative candidate must stop at READY_FOR_REVIEW");
  if (candidate?.publicCta !== BLINDBOXAI_URL) throw new Error("Narrative public CTA must remain BlindBoxAI");
  if (candidate?.publishAutomatically !== false) throw new Error("Narrative candidate must not auto-publish");
  const publicText = `${candidate?.hook ?? ""}\n${candidate?.caption ?? ""}`;
  if (RAW_MERCHANT_URL.test(publicText)) throw new Error("Narrative public copy must not contain raw merchant URLs");
  for (const rule of BLOCKED_FINANCIAL_LANGUAGE) {
    if (rule.test(publicText)) throw new Error(`Narrative public copy contains blocked financial language: ${rule}`);
  }
  if (!publicText.includes(FAN_STORY_DISCLOSURE)) throw new Error("Fan-story disclosure is required");
  if (!publicText.includes(AFFILIATE_DISCLOSURE)) throw new Error("Affiliate disclosure is required");
  return candidate;
}

export function buildNarrativeCandidate(series, { date = new Date(), priorityTerms = ["twinkle"] } = {}) {
  validateNarrativeSeries(series);
  const figures = safeEvidence(series);
  const seed = crypto.createHash("sha256").update(`${date.toISOString().slice(0, 10)}:${series.slug}:figure`).digest("hex");
  const figure = figures[Number.parseInt(seed.slice(0, 8), 16) % figures.length];
  const hookFamily = hookFamilyForDate(series, date);
  const hook = hookFamily.build({ seriesName: series.name, figureName: figure.name });
  const caption = [
    hook,
    "",
    FAN_STORY_DISCLOSURE,
    `Collector tools and verified research: ${BLINDBOXAI_URL}`,
    AFFILIATE_DISCLOSURE,
  ].join("\n");

  const candidate = {
    schema: NARRATIVE_SCHEMA,
    id: `${date.toISOString().slice(0, 10)}-${series.slug}-${hookFamily.id}`,
    state: NARRATIVE_STATE,
    persona: "Mr Know It All",
    hookFamily: hookFamily.id,
    hook,
    caption,
    publicCta: BLINDBOXAI_URL,
    publishAutomatically: false,
    source: {
      seriesSlug: series.slug,
      seriesName: series.name,
      brand: series.brand,
      priorityRank: narrativePriority(series, priorityTerms),
      completedSalesStatus: series.marketSelection.completedSalesStatus,
      evidence: [figure.evidence],
    },
    feedbackPlan: {
      measure: ["impressions", "video_views", "clicks", "saves", "comments"],
      optimizeFor: "qualified_engagement_and_blindboxai_clicks",
      rule: "Promote hook families only after repeated measured engagement. Never infer resale value or future price from engagement.",
    },
    disclosures: {
      fanStory: FAN_STORY_DISCLOSURE,
      affiliate: AFFILIATE_DISCLOSURE,
    },
    createdAt: date.toISOString(),
  };

  return assertNarrativeSafety(candidate);
}

export function buildNarrativePreview(candidate) {
  assertNarrativeSafety(candidate);
  return [
    `# Narrative Flywheel Review — ${candidate.source.seriesName}`,
    "",
    `**State:** ${candidate.state}`,
    `**Persona:** ${candidate.persona}`,
    `**Hook family:** ${candidate.hookFamily}`,
    "",
    "## Proposed public copy",
    "",
    candidate.caption,
    "",
    "## Verified source evidence",
    "",
    ...candidate.source.evidence.map((item) => `- ${item}`),
    "",
    "## Guardrails",
    "",
    "- Review only; no autonomous publish.",
    "- No raw merchant URL in public copy.",
    "- No price prediction, investment language, or guaranteed-return framing.",
    "- Fan-story content is explicitly labeled as unofficial.",
    "",
  ].join("\n");
}
