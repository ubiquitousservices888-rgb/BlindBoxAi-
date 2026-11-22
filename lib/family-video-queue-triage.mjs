// Offline Family AI triage of video queue snapshots. No provider access or writes.
// Stored public URLs are candidates, never evidence that a video is playable.
const RUN = /^rv-[a-f0-9]{16}$/;
const YOUTUBE = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
const STATES = new Set(["publishing", "failed", "approved", "published", "rejected"]);

export function triageVideoQueue(rows) {
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid queue snapshot");
  const seen = new Set();
  return rows.map(row => {
    if (!row || !RUN.test(row.research_run_id) || !STATES.has(row.status) ||
        seen.has(row.research_run_id)) throw new Error("Invalid or duplicate queue identity");
    seen.add(row.research_run_id);
    const youtubePostId = row.buffer_post_ids?.youtube;
    const candidate = row.public_urls?.youtube;
    const hasPost = typeof youtubePostId === "string" && /^[a-f0-9]{24}$/.test(youtubePostId);
    const hasCandidate = typeof candidate === "string" && YOUTUBE.test(candidate);
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
      mustNotRepublish: row.status === "publishing" && hasPost,
    };
  });
}
