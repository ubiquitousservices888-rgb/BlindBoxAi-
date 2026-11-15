// Read-only normalization for saved YouTube publishing receipts.
// Never manufactures a public proof, writes queue records, or schedules a post.
const RUN_ID = /^rv-[a-f0-9]{16}$/;
const POST_ID = /^[a-f0-9]{24}$/;
const STORAGE_HOST = "lazzdoadoqzrzlarerfx.supabase.co";
const STORAGE_PATH = "/storage/v1/object/public/blindboxai-review-videos/media/review/";
const SAFE_REASON = /^[A-Z0-9_]{3,80}$/;

function validMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === STORAGE_HOST &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      url.pathname.startsWith(STORAGE_PATH) && /^\/storage\/v1\/object\/public\/blindboxai-review-videos\/media\/review\/[^/]+\.mp4$/.test(url.pathname);
  } catch {
    return false;
  }
}

function safeYoutubeLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.youtube.com" || url.pathname !== "/watch" ||
        url.port || url.username || url.password || url.hash || url.searchParams.size !== 1) return null;
    const id = url.searchParams.get("v");
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? "https://www.youtube.com/watch?v=" + id : null;
  } catch {
    return null;
  }
}

export function validateStuckVideoSnapshot(snapshot) {
  if (snapshot?.schema !== "blindboxai.stuck-review-receipts/v1" ||
      !Array.isArray(snapshot.rows) || snapshot.rows.length === 0 || snapshot.rows.length > 20) {
    throw new Error("Invalid stuck review inventory");
  }
  const seenRun = new Set(), seenPost = new Set();
  const rows = [];
  for (const row of snapshot.rows) {
    const postId = row?.buffer_post_ids?.youtube;
    if (row?.status !== "publishing" || !RUN_ID.test(row.research_run_id) || !POST_ID.test(postId) ||
        Object.keys(row.buffer_post_ids || {}).length !== 1 ||
        !validMediaUrl(row.video_url) ||
        !Number.isSafeInteger(row.size_bytes) || row.size_bytes < 1 || row.size_bytes > 300000000 ||
        !Number.isFinite(Date.parse(row.publishing_at)) ||
        seenRun.has(row.research_run_id) || seenPost.has(postId)) {
      throw new Error("Invalid or duplicate stuck receipt identity");
    }
    seenRun.add(row.research_run_id);
    seenPost.add(postId);
    rows.push({
      research_run_id: row.research_run_id,
      video_url: row.video_url,
      size_bytes: row.size_bytes,
      buffer_post_ids: { youtube: postId },
    });
  }
  return rows;
}

export function summarizeStuckVideoReceipts(rows, receipts) {
  if (!Array.isArray(rows) || !Array.isArray(receipts)) throw new Error("Missing receipt evidence");
  const byRun = new Map();
  for (const entry of receipts) {
    if (entry?.channel !== "youtube") continue; // TikTok was not submitted for these five rows.
    if (!RUN_ID.test(entry.researchRunId) || byRun.has(entry.researchRunId)) throw new Error("Duplicate or invalid receipt");
    byRun.set(entry.researchRunId, entry);
  }
  if (byRun.size !== rows.length) throw new Error("Partial or extra YouTube evidence");
  const results = [];
  for (const row of rows) {
    const receipt = byRun.get(row.research_run_id);
    if (!receipt || receipt.postId !== row.buffer_post_ids.youtube) throw new Error("Exact Buffer ID mismatch");
    const publicUrl = safeYoutubeLink(receipt.publicUrl);
    const verified = receipt.status === "VERIFIED" && receipt.providerIdentityVerified === true &&
      receipt.attributionVerified === true && receipt.sourceProof?.matched === true &&
      publicUrl !== null && Number.isFinite(Date.parse(receipt.checkedAt));
    results.push({
      researchRunId: row.research_run_id,
      providerPostId: row.buffer_post_ids.youtube,
      status: verified ? "REVIEWABLE_PUBLIC_PROOF" : "HOLD_UNVERIFIED",
      ...(verified ? { publicUrl, checkedAt: receipt.checkedAt } : {
        reason: SAFE_REASON.test(receipt.reason || "") ? receipt.reason : "EVIDENCE_INCOMPLETE",
        ...(SAFE_REASON.test(receipt.publicCheckReason || "") ? { publicCheckReason: receipt.publicCheckReason } : {}),
        ...(safeYoutubeLink(receipt.candidatePublicUrl) ? { candidateUrlNotVerified: safeYoutubeLink(receipt.candidatePublicUrl) } : {}),
      }),
    });
  }
  return { reviewed: results.length, reviewable: results.filter(x => x.status === "REVIEWABLE_PUBLIC_PROOF").length,
    unresolved: results.filter(x => x.status === "HOLD_UNVERIFIED").length, results,
    writeActions: 0, publishActions: 0 };
}
