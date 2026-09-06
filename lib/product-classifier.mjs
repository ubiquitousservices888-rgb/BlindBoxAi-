const FIGURE_BRANDS = Object.freeze([
  "pop mart",
  "sonny angel",
  "smiski",
  "labubu",
  "the monsters",
]);

const FIGURE_KEYWORDS = Object.freeze([
  "blind box figure",
  "blind-box figure",
  "vinyl plush",
]);

export const ACCESSORY_OFFER_MAP = Object.freeze([
  { terms: ["display case", "protective case", "dust", "dustproof", "acrylic"], offerId: "acrylic-display-case" },
  { terms: ["stand", "riser"], offerId: "acrylic-display-risers" },
  { terms: ["lighting", "light", "led"], offerId: "mini-display-lighting" },
  { terms: ["storage", "organizer", "cleaning"], offerId: "figure-storage-organizer" },
  { terms: ["turntable", "rotator", "rotate"], offerId: "display-turntable" },
]);
const ACCESSORY_KEYWORDS = Object.freeze(
  [...new Set(ACCESSORY_OFFER_MAP.flatMap((entry) => entry.terms))],
);

export function productClassifierText(product = {}) {
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : "";
  const claims = Array.isArray(product.claims)
    ? product.claims.map((claim) => claim?.text).join(" ")
    : "";

  return [
    product.id,
    product.name,
    product.brand,
    product.category,
    product.type,
    product.description,
    tags,
    claims,
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchedTerms(text, terms) {
  return terms.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    return pattern.test(text);
  });
}

export function classifyProduct(product) {
  const text = productClassifierText(product);
  const brandMatches = matchedTerms(text, FIGURE_BRANDS);
  const figureKeywordMatches = matchedTerms(text, FIGURE_KEYWORDS);
  const strongFigureKeywordMatches = figureKeywordMatches.filter((signal) =>
    signal === "vinyl plush" || signal === "blind box figure" || signal === "blind-box figure");
  const figureMatches = [...brandMatches, ...figureKeywordMatches];
  const accessoryMatches = matchedTerms(text, ACCESSORY_KEYWORDS);
  const signals = Object.freeze({
    hasFigure: figureMatches.length > 0,
    hasAccessory: accessoryMatches.length > 0,
  });

  if (accessoryMatches.length && !figureMatches.length) {
    return {
      type: "accessory",
      reason: `Matched accessory signals: ${accessoryMatches.join(", ")}`,
      signals,
    };
  }

  if (figureMatches.length && accessoryMatches.length) {
    if (!brandMatches.length && !strongFigureKeywordMatches.length) {
      return {
        type: "accessory",
        reason: `Matched accessory signals: ${accessoryMatches.join(", ")}`,
        signals,
      };
    }
    return {
      type: "figure",
      reason: `Matched figure signals (${figureMatches.join(", ")}) and accessory signals (${accessoryMatches.join(", ")}).`,
      signals,
    };
  }

  if (figureMatches.length) {
    return {
      type: "figure",
      reason: `Matched figure signals: ${figureMatches.join(", ")}`,
      signals,
    };
  }

  if (accessoryMatches.length) {
    return {
      type: "accessory",
      reason: `Matched accessory signals: ${accessoryMatches.join(", ")}`,
      signals,
    };
  }

  return {
    type: "unknown",
    reason: "No trusted figure or accessory signals were detected.",
    signals,
  };
}
