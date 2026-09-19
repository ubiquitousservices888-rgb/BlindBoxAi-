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

export function requirePublicVideoTitle(value, { label = "public video title", maxLength = 100 } = {}) {
  const title = cleanPublicVideoTitle(value, maxLength);
  if (!isPublicVideoTitle(title)) {
    throw new Error(`${label} must describe the video; numeric IDs and camera-file names are not allowed`);
  }
  return title;
}
