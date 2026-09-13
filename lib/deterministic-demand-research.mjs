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
    userNeed: "Focused brand, series, character, card, set, player, and comparison guides",
    pattern: /\b(series|set|character|card|player|compare|comparison|difference|guide|which|best|collector)\b/i,
  },
]);

const VERTICAL_RULES = Object.freeze([
  { vertical: "pokemon_tcg", pattern: /\b(pokemon|pokémon|pokemon tcg|pokémon tcg)\b/i },
  { vertical: "magic_the_gathering", pattern: /\b(magic(?: the gathering)?|mtg)\b/i },
  { vertical: "yugioh", pattern: /\b(yu-?gi-?oh|yugioh)\b/i },
  { vertical: "sports_cards", pattern: /\b(sports? card|baseball card|basketball card|football card|hockey card|soccer card|f1 card|ufc card|wrestling card|topps|panini|bowman)\b/i },
  { vertical: "one_piece", pattern: /\b(one piece(?: card game| tcg)?)\b/i },
  { vertical: "disney_lorcana", pattern: /\b(lorcana|disney lorcana)\b/i },
  { vertical: "digimon", pattern: /\b(digimon(?: card game| tcg)?)\b/i },
  { vertical: "flesh_and_blood", pattern: /\b(flesh and blood|fab tcg)\b/i },
  { vertical: "dragon_ball", pattern: /\b(dragon ball|fusion world)\b/i },
  { vertical: "star_wars_unlimited", pattern: /\b(star wars unlimited|swu)\b/i },
  { vertical: "weiss_schwarz", pattern: /\bweiss schwarz\b/i },
  { vertical: "final_fantasy_tcg", pattern: /\b(final fantasy tcg|fftcg)\b/i },
  { vertical: "cardfight_vanguard", pattern: /\b(cardfight\s*!!?\s*vanguard|cardfight vanguard|vanguard card)\b/i },
  { vertical: "union_arena", pattern: /\bunion arena\b/i },
  { vertical: "pop_mart", pattern: /\b(pop mart|labubu|the monsters|skullpanda|hirono|crybaby|dimoo|molly|twinkle twinkle|pucky)\b/i },
  { vertical: "other_collectible_card", pattern: /\b(trading card|collectible card|tcg|ccg)\b/i },
  { vertical: "other_collectible_toy", pattern: /\b(blind box|designer toy|art toy|vinyl figure|sofubi|funko|bearbrick|sonny angel|smiski|kidrobot|hot toys)\b/i },
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

function classifyVerticals(clean) {
  const verticalThemes = [];
  for (const rule of VERTICAL_RULES) {
    const matches = clean.filter((question) => rule.pattern.test(question));
    if (!matches.length) continue;
    verticalThemes.push({ vertical: rule.vertical, count: uniqueQuestionCount(matches) });
  }
  verticalThemes.sort((a, b) => b.count - a.count || a.vertical.localeCompare(b.vertical));
  return verticalThemes;
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
      topic: "General collectible questions",
      userNeed: "Review uncategorized collectible questions before adding new knowledge-base coverage",
      count: unmatchedCount,
    });
  }

  themes.sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
  return {
    questions: clean,
    themes: themes.slice(0, 12),
    verticalThemes: classifyVerticals(clean).slice(0, 20),
  };
}

export function buildDeterministicDemandInput(questions) {
  const { questions: clean, themes, verticalThemes } = classifyPrivateDemand(questions);
  const top = themes[0];
  return {
    summary: clean.length
      ? "Deterministic private demand analysis completed without a hosted AI agent or paid model call. Fresh external evidence is intentionally deferred until a separate owner-reviewed research step."
      : "No recent private collector questions were available for deterministic demand analysis.",
    demandSummary: top
      ? `Highest repeated demand theme: ${top.topic}. This is a demand signal only, not market or profit evidence.`
      : "No repeated demand theme was detected in the available private question sample.",
    questionThemes: themes,
    verticalThemes,
    opportunities: [],
  };
}
