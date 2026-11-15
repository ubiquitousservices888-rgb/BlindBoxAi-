// Read-only normalization for saved YouTube publishing receipts.
// Never manufactures a public proof, writes queue records, or schedules a post.
const RUN_ID = /^rv-[a-f0-9]{16}$/;
const POST_ID = /^[a-f0-9]{24}$/;
const STORAGE_HOST = "lazzdoadoqzrzlarerfx.supabase.co";
const STORAGE_PATH = "/storage/v1/object/public/blindboxai-review-videos/media/review/";
const SAFE_REASON = /^[A-Z0-9_]{3,80}$/;
// Exact identity pairs obtained by read-only review_video_queue SELECT on 2026-11-15.
// Storage filenames do NOT encode research_run_id. Never infer an ID from a title
// or arbitrary URL; require every full observed (run, post, file, size) tuple.
const PINNED = new Map([
  ["rv-3658d7e94a70b562", ["6af206e07176a1c926fec680", "1790412198708-4639.mp4", 9336833]],
  ["rv-3c9c9bb78c37ff6a", ["6af206753aa5c0b251b55b48", "sha256-7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0.mp4", 121797]],
  ["rv-4815685fb0b10117", ["6af206094af3cc032bb492db", "1794241590727-3972.mp4", 7754855]],
  ["rv-6b6023cb4aaaca52", ["6af2064dc1ebd32415dc5e2f", "1794241144945-3973.mp4", 3904477]],
  ["rv-9c5d343830fb30a8", ["6af206e03aa5c0b251b59707", "1790216466129-3143.mp4", 4963475]],
]);

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
      !Array.isArray(snapshot.rows) || snapshot.rows.length !== PINNED.size) {
    throw new Error("Invalid stuck review inventory");
  }
  const seenRun = new Set(), seenPost = new Set();
  const rows = [];
  for (const row of snapshot.rows) {
    const postId = row?.buffer_post_ids?.youtube;
    const expected = PINNED.get(row?.research_run_id);
    if (row?.status !== "publishing" || !RUN_ID.test(row.research_run_id) || !POST_ID.test(postId) ||
        Object.keys(row.buffer_post_ids || {}).length !== 1 ||
        !expected || postId !== expected[0] ||
        !validMediaUrl(row.video_url) ||
        row.video_url !== `https://${STORAGE_HOST}${STORAGE_PATH}${expected[1]}` ||
        row.size_bytes !== expected[2] ||
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
  if (seenRun.size !== PINNED.size) throw new Error("Incomplete pinned receipt inventory");
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
