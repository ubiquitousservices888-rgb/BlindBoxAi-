export const VERTICALS = ["bb", "sc", "tc"];
export const PLATFORMS = ["yt", "tt", "ig", "x", "pin", "fb", "other"];

const SRC_RE = /^(bb|sc|tc)_(yt|tt|ig|x|pin|fb|other)_\d{3}$/;
const CUSTOM_ID_RE = /^[a-z0-9._-]+$/;
const MAX_CUSTOM_ID = 64;

export function isValidSource(s) {
  return typeof s === "string" && SRC_RE.test(s);
}

export function verticalFromSource(source) {
  return isValidSource(source) ? source.slice(0, 2) : null;
}

export function sanitizeSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildCustomId({ vertical, source, itemSlug }) {
  const v = VERTICALS.includes(vertical) ? vertical : "bb";
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
  const v = VERTICALS.includes(vertical) ? vertical : derivedVertical || "bb";
  return {
    vertical: v,
    source: validSource,
    itemSlug: sanitizeSlug(itemSlug),
  };
}
