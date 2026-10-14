// Presentation-only status mapping for the public video feed. This module does not publish.
export function publicVideoStatusLabel(status) {
  if (status === "published") return "Published";
  if (status === "partial") return "Partially published";
  return null;
}

export function isPublicVideo(item) {
  if (!publicVideoStatusLabel(item?.status) || !String(item?.title ?? "").trim()) return false;
  try {
    return new URL(String(item?.video_url ?? "")).protocol === "https:";
  } catch {
    return false;
  }
}

export function summarizePublicVideos(videos) {
  let published = 0;
  let partial = 0;
  for (const video of Array.isArray(videos) ? videos : []) {
    if (video?.status === "published") published += 1;
    if (video?.status === "partial") partial += 1;
  }
  return `${published} published${partial ? ` · ${partial} partially published` : ""}`;
}
