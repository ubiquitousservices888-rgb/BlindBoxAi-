const VERTICAL_TITLE_LABELS = Object.freeze({
  pokemon_tcg: "Pokémon Collectible Review",
  sports_cards: "Sports Card Collectible Review",
  magic_the_gathering: "Magic: The Gathering Collectible Review",
  pop_mart: "Designer Toy Collectible Review",
  other_collectible: "Collectible Review",
});

export function cleanPublicVideoTitle(value, maxLength = 100) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function isPublicVideoTitle(value) {
  const title = cleanPublicVideoTitle(value, 100);
  if (!title || /https?:\/\//i.test(title)) return false;
  if (!/[A-Za-z]/.test(title)) return false;
  if (/^\d+$/.test(title)) return false;
  if (/^(?:img|vid(?:eo)?|mov|pxl|clip|recording|screen[ _-]?record(?:ing)?)[ ._-]*\d*$/i.test(title)) return false;
  return true;
}

function repairQualifier(value, researchRunId) {
  const title = cleanPublicVideoTitle(value, 40);
  if (/^\d+$/.test(title)) return `Item ${title.slice(0, 16)}`;
  const runId = String(researchRunId ?? "").trim();
  if (/^rv-[a-f0-9]{16}$/.test(runId)) return `Ref ${runId.slice(-6)}`;
  return "";
}

export function resolvePublicVideoTitle(value, {
  vertical = "other_collectible",
  researchRunId = "",
  maxLength = 100,
} = {}) {
  const cleaned = cleanPublicVideoTitle(value, maxLength);
  if (isPublicVideoTitle(cleaned)) return cleaned;

  const label = VERTICAL_TITLE_LABELS[String(vertical || "").trim()] || VERTICAL_TITLE_LABELS.other_collectible;
  const qualifier = repairQualifier(cleaned, researchRunId);
  return cleanPublicVideoTitle(
    `BlindBoxAI ${label}${qualifier ? ` — ${qualifier}` : ""}`,
    maxLength,
  );
}

export function requirePublicVideoTitle(value, { label = "public video title", maxLength = 100 } = {}) {
  const title = cleanPublicVideoTitle(value, maxLength);
  if (!isPublicVideoTitle(title)) {
    throw new Error(`${label} must describe the video; numeric IDs and camera-file names are not allowed`);
  }
  return title;
}
