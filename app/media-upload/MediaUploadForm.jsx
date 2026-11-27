"use client";

import { useState } from "react";
import { resolvePublicVideoTitle } from "../../lib/public-video-title.mjs";
import { assertYoutubeShortsMetadata } from "../../lib/review-shorts-eligibility.mjs";
import { uploadOrRecoverReviewMedia, normalizeReviewUploadError } from "../../lib/review-upload-identity.mjs";
import { loadMobileReviewPreview, mobileReviewReady, launchMobileReview } from "../../lib/mobile-review-approval.mjs";

const STORAGE_BROKER = "/api/media/free-upload-ticket";
const MOBILE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

function safeTitleFromFile(name) {
  return String(name || "Collector research video")
    .replace(/\.mp4$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "Collector research video";
}

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const metadata = {
        durationSeconds: Number(video.duration),
        width: Number(video.videoWidth),
        height: Number(video.videoHeight),
      };
      cleanup();
      if (![metadata.durationSeconds, metadata.width, metadata.height].every((value) => Number.isFinite(value) && value > 0)) {
        reject(new Error("Could not read valid duration and dimensions from this MP4."));
        return;
      }
      resolve(metadata);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read this MP4's video metadata."));
    };
    video.src = objectUrl;
  });
}

async function requestUploadTicket({ accessCode, path, sizeBytes }) {
  const response = await fetch(STORAGE_BROKER, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, sizeBytes }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.signedUrl || !body?.publicUrl) {
    throw new Error(body?.error || "Unable to authorize free video storage.");
  }
  return body;
}


async function verifyExistingUpload({ accessCode, path, sizeBytes }) {
  const response = await fetch(STORAGE_BROKER, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "verify_existing", path, sizeBytes }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "Stored video verification failed.");
  return body;
}

function uploadToSignedUrl({ signedUrl, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = MOBILE_UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Storage upload failed."));
    xhr.ontimeout = () => reject(new Error("Storage upload timed out."));
    xhr.onabort = () => reject(new Error("Storage upload aborted."));

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

async function stageForResearch({ accessCode, blob, title, file, metadata }) {
  const response = await fetch("/api/owner/stage-review", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      videoUrl: blob.url,
      title,
      sizeBytes: file.size,
      durationSeconds: metadata.durationSeconds,
      width: metadata.width,
      height: metadata.height,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "Upload finished, but research staging failed.");
  return body;
}

async function approveVideo({ accessCode, videoUrl, researchRunId, reviewedTitle, youtubeAudience }) {
  const response = await fetch("/api/owner/approve-review", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ videoUrl, researchRunId, reviewedTitle, youtubeAudience: youtubeAudience }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "Unable to approve this video.");
  return body;
}

export default function MediaUploadForm() {
  const [accessCode, setAccessCode] = useState("");
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [stageResult, setStageResult] = useState(null);
  const [stagingPayload, setStagingPayload] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [reviewPreview, setReviewPreview] = useState(null);
  const [youtubeAudience, setYoutubeAudience] = useState("");

  async function refreshReview(staged, blob, code) {
    setReviewPreview(null);
    setYoutubeAudience("");
    try {
      const preview = await loadMobileReviewPreview({ accessCode: code, videoUrl: blob.url, researchRunId: staged.researchRunId, reviewedTitle: staged.title });
      setReviewPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed. Check the owner dashboard.");
    }
  }

  async function retryReview() {
    if (busy || approved || !stageResult || !result?.url || !accessCode) return;
    setBusy(true);
    setError("");
    try { await refreshReview(stageResult, result, accessCode); }
    finally { setBusy(false); }
  }

  async function retryStage() {
    if (!stagingPayload || !accessCode) return;
    setBusy(true);
    setStatus("staging");
    setError("");
    try {
      const staged = await stageForResearch({ accessCode, ...stagingPayload });
      setStageResult(staged);
      setStagingPayload(null);
      setStatus("complete");
      await refreshReview(staged, stagingPayload.blob, accessCode);
    } catch (err) {
      setStatus("staging_failed");
      setError(err instanceof Error ? err.message : "Review action failed. Check the owner dashboard.");
    } finally {
      setBusy(false);
    }
  }

  async function approveCurrentVideo() {
    if (!result?.url || !accessCode || approved || busy || !mobileReviewReady(reviewPreview) || !youtubeAudience) return;
    setBusy(true);
    setError("");
    try {
      await launchMobileReview({ accessCode, videoUrl: result.url, researchRunId: stageResult?.researchRunId, reviewedTitle: stageResult?.title, youtubeAudience, preview: reviewPreview, postApproval: approveVideo });
      setApproved(true);
      setStatus("approved");
      setAccessCode("");
    } catch (err) {
      setReviewPreview(null);
      setYoutubeAudience("");
      setError(err instanceof Error ? err.message : "Review action failed. Check the owner dashboard.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || approved || stageResult || stagingPayload) return;
    setError("");
    setResult(null);
    setStageResult(null);
    setStagingPayload(null);
    setApproved(false);
    setReviewPreview(null);
    setYoutubeAudience("");

    if (!file) return setError("Choose an MP4 video first.");
    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) return setError("Only MP4 video files are allowed.");
    if (file.size <= 0 || file.size > MAX_VIDEO_SIZE) return setError("Video must be larger than 0 bytes and no more than 100 MB.");
    const repairedTitle = resolvePublicVideoTitle(title, { maxLength: 100 });
    if (repairedTitle !== title) setTitle(repairedTitle);

    setBusy(true);
    setProgress(0);
    setStatus("reading_metadata");
    let uploadedBlob = null;

    try {
      const metadata = await readVideoMetadata(file);
      assertYoutubeShortsMetadata(metadata);
      setStatus("authorizing");
      // One media/review path for identical bytes, even after a rename or reload.
      // Verify existing bytes before reuse. Never retry a mutating PUT automatically.
      const blob = await uploadOrRecoverReviewMedia({
        file,
        verifyExisting: (params) => verifyExistingUpload({ accessCode, ...params }),
        requestTicket: (params) => requestUploadTicket({ accessCode, ...params }),
        upload: async (ticket) => {
          setStatus("uploading");
          await uploadToSignedUrl({ signedUrl: ticket.signedUrl, file, onProgress: setProgress });
        },
      });
      uploadedBlob = blob;
      setResult(blob);

      const payload = { blob, title: repairedTitle, file, metadata };
      setStagingPayload(payload);
      setStatus("staging");
      const staged = await stageForResearch({ accessCode, ...payload });
      setStageResult(staged);
      setStagingPayload(null);
      setStatus("complete");
      await refreshReview(staged, blob, accessCode);
    } catch (err) {
      setStatus(uploadedBlob?.url ? "staging_failed" : "failed");
      setError(uploadedBlob?.url ? (err instanceof Error ? err.message : "Research staging failed. Retry staging only.") : normalizeReviewUploadError(err));
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = busy
    ? status === "reading_metadata"
      ? "Reading video details..."
      : status === "authorizing"
        ? "Checking existing video and authorizing storage..."
        : status === "staging"
          ? "Staging research campaign..."
          : status === "approved"
            ? "Approved"
            : progress >= 100
              ? "Finalizing public video URL..."
              : `Uploading ${progress}%`
    : status === "failed"
      ? "Retry upload"
      : "Upload & stage for research";

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <strong>Owner upload code</strong>
        <input type="password" autoComplete="off" value={accessCode} onChange={(event) => { setAccessCode(event.target.value); setReviewPreview(null); setYoutubeAudience(""); }} required disabled={busy || approved} style={{ padding: 12, fontSize: 16 }} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <strong>Research title</strong>
        <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} disabled={busy || approved || Boolean(stageResult) || Boolean(stagingPayload)} placeholder="What Would You Pay? — Tanner Houck Rookie Auto Relic" style={{ padding: 12, fontSize: 16 }} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <strong>MP4 to test</strong>
        <input
          type="file"
          accept="video/mp4,.mp4"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            setFile(nextFile);
            if (nextFile) setTitle(safeTitleFromFile(nextFile.name));
            setStatus("idle");
            setError("");
            setResult(null);
            setStageResult(null);
            setStagingPayload(null);
            setProgress(0);
            setApproved(false);
            setReviewPreview(null);
            setYoutubeAudience("");
          }}
          required
          disabled={busy || approved}
          style={{ padding: 12 }}
        />
      </label>

      {!stageResult && (!stagingPayload || busy) && !approved ? <button type="submit" disabled={busy} style={{ padding: 14, fontSize: 16, fontWeight: 700 }}>{buttonLabel}</button> : null}

      {busy ? <p aria-live="polite" style={{ margin: 0 }}>Keep this page open until the current step finishes.</p> : null}
      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}

      {result?.url ? (
        <div style={{ padding: 16, border: "1px solid currentColor", borderRadius: 12 }}>
          <strong>Public MP4 ready</strong>
          <p style={{ overflowWrap: "anywhere" }}><a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></p>
          {stageResult ? (
            <>
              <p><strong>Ready for owner review.</strong> Watch this exact MP4 before approving it.</p>
              <video src={result.url} controls playsInline preload="metadata" style={{ width: "100%", maxWidth: 420, borderRadius: 10, background: "black" }} />
              <p>Research campaign: <code>{stageResult.campaignId}</code></p>
              {!approved ? (
                <>
                  {reviewPreview?.channels.map(entry => (
                    <div key={entry.channel} style={{ margin: "12px 0", overflowWrap: "anywhere" }}>
                      <strong>{entry.channel === "youtube" ? "YouTube" : "TikTok"}</strong>
                      {entry.ok ? <><p>{entry.title}</p><p>Promotion destination: {entry.landing}</p><p>{entry.link}</p><p style={{ whiteSpace: "pre-wrap" }}>{entry.caption}</p></> : <p role="alert">{entry.error}</p>}
                    </div>
                  ))}
                  {!mobileReviewReady(reviewPreview) ? <p role="note">Both promotion previews must be ready before Blue approval.</p> : null}
                  <button type="button" disabled={busy || !accessCode} onClick={retryReview}>Refresh promotion preview</button>
                  <fieldset disabled={busy || !mobileReviewReady(reviewPreview)} style={{ margin: "12px 0" }}>
                    <legend>YouTube audience</legend>
                    <label><input type="radio" name="mobile-review-audience" checked={youtubeAudience === "not_made_for_kids"} onChange={() => setYoutubeAudience("not_made_for_kids")} /> Not made for kids</label>{" "}
                    <label><input type="radio" name="mobile-review-audience" checked={youtubeAudience === "made_for_kids"} onChange={() => setYoutubeAudience("made_for_kids")} /> Made for kids</label>
                  </fieldset>
                  <button type="button" disabled={busy || !accessCode || !mobileReviewReady(reviewPreview) || !youtubeAudience} onClick={approveCurrentVideo} style={{ padding: 14, fontWeight: 800, background: mobileReviewReady(reviewPreview) && youtubeAudience && !busy ? "#2563eb" : "#64748b", color: "white", border: 0, borderRadius: 8 }}>
                    BLUE APPROVE + LAUNCH
                  </button>
                </>
              ) : (
                <p role="status"><strong>APPROVED + LAUNCH DISPATCHED.</strong> YouTube and TikTok are now handled automatically. YouTube audience: {youtubeAudience === "made_for_kids" ? "made for kids" : "not made for kids"}.</p>
              )}
            </>
          ) : stagingPayload && status === "staging_failed" ? (
            <>
              <p>The upload is safe. Research staging did not finish, so do not upload it again.</p>
              <button type="button" disabled={busy || !accessCode} onClick={retryStage} style={{ padding: 12, fontWeight: 700 }}>Retry research staging only</button>
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
