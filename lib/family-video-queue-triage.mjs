// Offline Family AI triage of video queue snapshots. No provider access or writes.
// Stored public URLs are candidates, never evidence that a video is playable.
const RUN = /^rv-[a-f0-9]{16}$/;
function validYoutubeCandidate(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") return url.pathname.length === 12 && /^[A-Za-z0-9_-]{11}$/.test(url.pathname.slice(1));
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) return false;
    if (url.pathname === "/watch") return /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") || "");
    const parts = url.pathname.split("/");
    return parts.length === 3 && ["shorts", "live"].includes(parts[1]) && /^[A-Za-z0-9_-]{11}$/.test(parts[2]);
  } catch { return false; }
}
const STATES = new Set(["ready_for_review", "publishing", "failed", "approved", "published", "rejected"]);

export function triageVideoQueue(rows) {
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid queue snapshot");
  if (Array.from({ length: rows.length }, (_, i) => i).some(i => !(i in rows))) throw new Error("Sparse queue snapshot");
  const seen = new Set();
  const seenProviderIds = new Set();
  return rows.map(row => {
    if (!row || !RUN.test(row.research_run_id) || !STATES.has(row.status) ||
        seen.has(row.research_run_id)) throw new Error("Invalid or duplicate queue identity");
    seen.add(row.research_run_id);
    const youtubePostId = row.buffer_post_ids?.youtube;
    const candidate = row.public_urls?.youtube;
    const hasPost = typeof youtubePostId === "string" && youtubePostId.trim().length > 0 && youtubePostId.length <= 512;
    if (hasPost && seenProviderIds.has(youtubePostId)) throw new Error("Duplicate YouTube provider receipt");
    if (hasPost) seenProviderIds.add(youtubePostId);
    const hasCandidate = validYoutubeCandidate(candidate);
    let nextAction;
    if (row.status === "publishing") {
      nextAction = hasPost ? "RECONCILE_EXACT_PROVIDER_RECEIPT" : "HOLD_MISSING_PROVIDER_ID";
    } else if (row.status === "failed") {
      nextAction = "REVIEW_FAILURE_AND_MEDIA_PREFLIGHT";
    } else if (row.status === "published") {
      nextAction = "AUDIT_PUBLIC_PROOF";
    } else {
      nextAction = "RESPECT_EXISTING_REVIEW_GATE";
    }
    return {
      researchRunId: row.research_run_id,
      status: row.status,
      hasExactYoutubePostId: hasPost,
      hasCandidateYoutubeUrl: hasCandidate,
      publicProofVerified: false,
      nextAction,
      mustNotRepublish: row.status === "publishing",
    };
  });
}
