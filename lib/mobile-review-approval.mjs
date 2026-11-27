// The mobile card uses the same authenticated queue preview as the owner dashboard.
// Never infer an audience, accept a title-only match, or approve a changed preview.
const CHANNELS = ["youtube", "tiktok"];
const AUDIENCES = new Set(["made_for_kids", "not_made_for_kids"]);

function previewForRow(row) {
  if (!Array.isArray(row.caption_preview) || row.caption_preview.length !== CHANNELS.length) throw new Error("Both channel previews are required.");
  return CHANNELS.map(channel => {
    const matches = row.caption_preview.filter(entry => entry?.channel === channel);
    if (matches.length !== 1) throw new Error("Both channel previews are required.");
    const entry = matches[0];
    if (entry.ok !== true) return { channel, ok: false, error: typeof entry.error === "string" ? entry.error : "Promotion preview is blocked." };
    const { title, link, caption, landing } = entry;
    if (![title, link, caption, landing].every(value => typeof value === "string" && value.trim())) throw new Error("Promotion preview is incomplete.");
    let url;
    try { url = new URL(link); } catch { throw new Error("Promotion preview link is invalid."); }
    if (url.protocol !== "https:" || url.username || url.password || !caption.includes(link)) throw new Error("Promotion preview link is invalid.");
    return { channel, ok: true, title, link, caption, landing };
  });
}

export async function loadMobileReviewPreview({ accessCode, videoUrl, researchRunId, reviewedTitle, fetchImpl = fetch }) {
  if (!accessCode || typeof videoUrl !== "string" || !videoUrl || !/^rv-[a-f0-9]{16}$/.test(researchRunId || "") || typeof reviewedTitle !== "string" || !reviewedTitle) throw new Error("Exact reviewed video and owner control code are required.");
  const response = await fetchImpl("/api/owner/review-queue?include=approved", { headers: { Authorization: `Bearer ${accessCode}` }, cache: "no-store" });
  if (response.status === 401) throw new Error("Video staged. Enter the owner control code to review and approve.");
  if (!response.ok) throw new Error("Unable to load the promotion preview. Retry review, not upload.");
  const body = await response.json();
  const matches = Array.isArray(body?.items) ? body.items.filter(row => row?.research_run_id === researchRunId && row.video_url === videoUrl && row.title === reviewedTitle && ["ready_for_review", "approved"].includes(row.status)) : [];
  if (matches.length !== 1) throw new Error("The exact staged review is unavailable. Refresh the owner dashboard.");
  return { videoUrl, researchRunId, reviewedTitle, channels: previewForRow(matches[0]) };
}

export function mobileReviewReady(preview) {
  return Array.isArray(preview?.channels) && preview.channels.length === CHANNELS.length && CHANNELS.every((channel, i) => preview.channels[i]?.channel === channel && preview.channels[i].ok === true);
}

export async function launchMobileReview({ accessCode, videoUrl, researchRunId, reviewedTitle, youtubeAudience, preview, postApproval, fetchImpl = fetch }) {
  if (!AUDIENCES.has(youtubeAudience)) throw new Error("Choose the YouTube audience before approval.");
  if (!mobileReviewReady(preview) || preview.videoUrl !== videoUrl || preview.researchRunId !== researchRunId || preview.reviewedTitle !== reviewedTitle) throw new Error("Review both exact promotion previews before approval.");
  const current = await loadMobileReviewPreview({ accessCode, videoUrl, researchRunId, reviewedTitle, fetchImpl });
  if (!mobileReviewReady(current) || JSON.stringify(current) !== JSON.stringify(preview)) throw new Error("The promotion preview changed. Reload and review it before approving.");
  // This is a client-side recheck; durable server-side approval binding remains a separate gate.
  return postApproval({ accessCode, videoUrl, researchRunId, reviewedTitle, youtubeAudience });
}
