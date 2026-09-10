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
  { terms: ["display case", "display cases", "protective case", "protective cases", "dustproof case", "dustproof cases", "acrylic display case", "acrylic display cases"], offerId: "acrylic-display-case" },
  { terms: ["display stand", "display stands", "display riser", "display risers", "acrylic riser", "acrylic risers"], offerId: "acrylic-display-risers" },
  { terms: ["display lighting", "led display", "led displays", "puck light", "puck lights"], offerId: "mini-display-lighting" },
  { terms: ["storage organizer", "storage organizers", "figure organizer", "figure organizers", "collectible storage"], offerId: "figure-storage-organizer" },
  { terms: ["display turntable", "display turntables", "motorized turntable", "motorized turntables", "display rotator", "display rotators"], offerId: "display-turntable" },
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

export function hasProductToken(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\function matchedTerms(text, terms) {
  return terms.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    return pattern.test(text);
  });
}");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

function matchedTerms(text, terms) {
  return terms.filter((term) => hasProductToken(text, term));
}

export function classifyProduct(product) {
  const text = productClassifierText(product);
  const brandMatches = matchedTerms(text, FIGURE_BRANDS);
  const figureKeywordMatches = matchedTerms(text, FIGURE_KEYWORDS);
  const strongFigureText = [product?.name, product?.brand, product?.category, product?.type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const strongFigureKeywordMatches = matchedTerms(strongFigureText, FIGURE_KEYWORDS);
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
    if (!strongFigureKeywordMatches.length) {
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

  return {
    type: "unknown",
    reason: "No trusted figure or accessory signals were detected.",
    signals,
  };
}
