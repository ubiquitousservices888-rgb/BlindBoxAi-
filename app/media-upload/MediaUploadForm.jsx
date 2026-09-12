"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";

const MOBILE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;

function safeName(name) {
  const base = String(name || "review-video.mp4")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`;
}

function safeTitleFromFile(name) {
  return String(name || "Collector research video")
    .replace(/\.mp4$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Collector research video";
}

function normalizeUploadError(error) {
  const message = error instanceof Error ? error.message : "Upload failed.";
  if (/token has expired/i.test(message)) {
    return "Upload authorization expired. Tap Upload & stage for research again to request a fresh token.";
  }
  if (/abort|aborted/i.test(message)) {
    return "Upload timed out before Vercel Blob confirmed it. Keep this page open and retry once.";
  }
  return message;
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
  if (!response.ok) {
    throw new Error(body?.error || "Upload finished, but research staging failed.");
  }
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
      setAccessCode("");
    } catch (err) {
      setStatus("staging_failed");
      setError(normalizeUploadError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setStageResult(null);
    setStagingPayload(null);

    if (!file) {
      setError("Choose an MP4 video first.");
      return;
    }
    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      setError("Only MP4 video files are allowed.");
      return;
    }
    if (!title.trim()) {
      setError("Give the video a short research title.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setStatus("reading_metadata");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MOBILE_UPLOAD_TIMEOUT_MS);
    let uploadedBlob = null;

    try {
      const metadata = await readVideoMetadata(file);
      setStatus("authorizing");
      const pathname = `media/review/${Date.now()}-${safeName(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/media/review-upload",
        clientPayload: JSON.stringify({ accessCode }),
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => {
          setStatus("uploading");
          setProgress(Math.round(percentage));
        },
      });

      if (!blob?.url || !/^https:\/\//i.test(blob.url)) {
        throw new Error("Vercel Blob did not return a public HTTPS media URL.");
      }

      uploadedBlob = blob;
      setResult(blob);
      const payload = { blob, title: title.trim().slice(0, 120), file, metadata };
      setStagingPayload(payload);
      setStatus("staging");
      const staged = await stageForResearch({ accessCode, ...payload });
      setStageResult(staged);
      setStagingPayload(null);
      setStatus("complete");
      setAccessCode("");
    } catch (err) {
      setStatus(uploadedBlob?.url ? "staging_failed" : "failed");
      setError(normalizeUploadError(err));
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  const buttonLabel = busy
    ? status === "reading_metadata"
      ? "Reading video details..."
      : status === "authorizing"
        ? "Authorizing fresh upload..."
        : status === "staging"
          ? "Staging research campaign..."
          : progress >= 100
            ? "Finalizing public Blob URL..."
            : `Uploading ${progress}%`
    : status === "failed"
      ? "Retry upload"
      : "Upload & stage for research";

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <strong>Owner upload code</strong>
        <input
          type="password"
          autoComplete="off"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          required
          disabled={busy}
          style={{ padding: 12, fontSize: 16 }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <strong>Research title</strong>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
          disabled={busy}
          placeholder="What Would You Pay? — Tanner Houck Rookie Auto Relic"
          style={{ padding: 12, fontSize: 16 }}
        />
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
          }}
          required
          disabled={busy}
          style={{ padding: 12 }}
        />
      </label>

      <button type="submit" disabled={busy} style={{ padding: 14, fontSize: 16, fontWeight: 700 }}>
        {buttonLabel}
      </button>

      {busy ? (
        <p aria-live="polite" style={{ margin: 0 }}>
          Keep this page open until it says <strong>Ready for owner review</strong>.
        </p>
      ) : null}

      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}

      {result?.url ? (
        <div style={{ padding: 16, border: "1px solid currentColor", borderRadius: 12 }}>
          <strong>Public MP4 ready</strong>
          <p style={{ overflowWrap: "anywhere" }}>
            <a href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
          </p>
          {stageResult ? (
            <>
              <p><strong>Ready for owner review.</strong> Approval will queue this exact MP4 to Buffer with traction attribution.</p>
              <p>Research campaign: <code>{stageResult.campaignId}</code></p>
            </>
          ) : stagingPayload ? (
            <>
              <p>The upload is safe. Research staging did not finish, so do not upload it again.</p>
              <button type="button" disabled={busy || !accessCode} onClick={retryStage} style={{ padding: 12, fontWeight: 700 }}>
                Retry research staging only
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
