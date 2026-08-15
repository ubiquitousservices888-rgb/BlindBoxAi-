const INTENT_RULES = Object.freeze([
  {
    topic: "Authenticity and counterfeit checks",
    userNeed: "Clear verification steps and counterfeit warning signs",
    pattern: /\b(authentic|authenticity|counterfeit|fake|real|verify|verification|qr|hologram|teeth)\b/i,
  },
  {
    topic: "Price and resale evidence",
    userNeed: "Reviewed sold-price evidence separated from asking prices",
    pattern: /\b(price|priced|pricing|value|worth|resale|sold|sale|market|expensive)\b/i,
  },
  {
    topic: "Release and availability",
    userNeed: "Current release, restock, availability, and series information",
    pattern: /\b(release|released|launch|drop|restock|available|availability|new|when)\b/i,
  },
  {
    topic: "Pull odds and rarity",
    userNeed: "Published odds, rarity, secret-pull, and edition explanations",
    pattern: /\b(odds|rarity|rare|secret|pull|chance|probability|edition)\b/i,
  },
  {
    topic: "Buyer path and affiliate intent",
    userNeed: "A safe on-site path to relevant active listings without raw affiliate URLs in social copy",
    pattern: /\b(buy|buying|where|listing|listings|shop|shopping|affiliate|deal|purchase)\b/i,
  },
  {
    topic: "Series guides and comparisons",
    userNeed: "Focused brand, series, character, and comparison guides",
    pattern: /\b(series|character|compare|comparison|difference|guide|which|best|collector)\b/i,
  },
]);

function cleanQuestion(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function uniqueQuestionCount(values) {
  return new Set(values.map((value) => value.toLowerCase())).size;
}

export function classifyPrivateDemand(questions) {
  const clean = (Array.isArray(questions) ? questions : [])
    .map(cleanQuestion)
    .filter((question) => question.length >= 3)
    .slice(-250);

  const themes = [];
  for (const rule of INTENT_RULES) {
    const matches = clean.filter((question) => rule.pattern.test(question));
    if (!matches.length) continue;
    themes.push({
      topic: rule.topic,
      userNeed: rule.userNeed,
      count: uniqueQuestionCount(matches),
    });
  }

  const matched = clean.filter((question) => INTENT_RULES.some((rule) => rule.pattern.test(question)));
  const unmatchedCount = Math.max(0, uniqueQuestionCount(clean) - uniqueQuestionCount(matched));
  if (unmatchedCount > 0) {
    themes.push({
      topic: "General blind-box questions",
      userNeed: "Review uncategorized collector questions before adding new knowledge-base coverage",
      count: unmatchedCount,
    });
  }

  themes.sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
  return { questions: clean, themes: themes.slice(0, 12) };
}

export function buildDeterministicDemandInput(questions) {
  const { questions: clean, themes } = classifyPrivateDemand(questions);
  const top = themes[0];
  return {
    summary: clean.length
      ? "Deterministic private demand analysis completed without a hosted AI agent or paid model call. Fresh external evidence is intentionally deferred until a separate owner-reviewed research step."
      : "No recent private collector questions were available for deterministic demand analysis.",
    demandSummary: top
      ? `Highest repeated demand theme: ${top.topic}. This is a demand signal only, not market or profit evidence.`
      : "No repeated demand theme was detected in the available private question sample.",
    questionThemes: themes,
    opportunities: [],
  };
}
