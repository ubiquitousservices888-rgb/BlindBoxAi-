export const VERTICALS = ["bb", "sc", "tc"];
export const PLATFORMS = ["yt", "tt", "ig", "x", "pin", "fb", "other"];

const escapeRegexToken = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const verticalPattern = VERTICALS.map(escapeRegexToken).join("|");
const platformPattern = PLATFORMS.map(escapeRegexToken).join("|");
const SRC_RE = new RegExp(`^(${verticalPattern})_(${platformPattern})_\\d{3}$`);
const CUSTOM_ID_RE = /^[a-z0-9._-]+$/;
const MAX_CUSTOM_ID = 64;

function sourceMatch(source) {
  return typeof source === "string" ? SRC_RE.exec(source) : null;
}

export function isValidSource(source) {
  return Boolean(sourceMatch(source));
}

export function verticalFromSource(source) {
  return sourceMatch(source)?.[1] ?? null;
}

export function sanitizeSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-+$/g, "");
}

export function buildCustomId({ vertical, source, itemSlug }) {
  const sourceVertical = verticalFromSource(source);
  const v = sourceVertical || (VERTICALS.includes(vertical) ? vertical : "bb");
  const s = isValidSource(source) ? source : "none";
  const prefix = `${v}.${s}.`;
  const room = MAX_CUSTOM_ID - prefix.length;
  const item = sanitizeSlug(itemSlug).slice(0, Math.max(room, 0));
  const value = prefix + item;

  if (value.length > MAX_CUSTOM_ID || !CUSTOM_ID_RE.test(value)) {
    throw new Error("Invalid attribution customid");
  }

  return value;
}

export function parseAttribution({ source, vertical, itemSlug }) {
  const validSource = isValidSource(source) ? source : "none";
  const derivedVertical = verticalFromSource(validSource);
  const v = derivedVertical || (VERTICALS.includes(vertical) ? vertical : "bb");
  return {
    vertical: v,
    source: validSource,
    itemSlug: sanitizeSlug(itemSlug),
  };
}
