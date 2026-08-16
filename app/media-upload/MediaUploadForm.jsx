"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";

const MOBILE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;

function safeName(name) {
  const base = String(name || "approved-video.mp4")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`;
}

function normalizeUploadError(error) {
  const message = error instanceof Error ? error.message : "Upload failed.";
  if (/token has expired/i.test(message)) {
    return "Upload authorization expired. Tap Upload approved video again to request a fresh token.";
  }
  if (/abort|aborted/i.test(message)) {
    return "Upload timed out before Vercel Blob confirmed it. Keep this page open and retry once.";
  }
  return message;
}

export default function MediaUploadForm() {
  const [accessCode, setAccessCode] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!file) {
      setError("Choose an MP4 video first.");
      return;
    }
    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      setError("Only MP4 video files are allowed.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setStatus("authorizing");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MOBILE_UPLOAD_TIMEOUT_MS);

    try {
      const pathname = `media/approved/${Date.now()}-${safeName(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
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

      setStatus("complete");
      setResult(blob);
      setAccessCode("");
    } catch (err) {
      setStatus("failed");
      setError(normalizeUploadError(err));
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  const buttonLabel = busy
    ? status === "authorizing"
      ? "Authorizing fresh upload..."
      : progress >= 100
        ? "Finalizing public Blob URL..."
        : `Uploading ${progress}%`
    : status === "failed"
      ? "Retry with fresh authorization"
      : "Upload approved video";

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
        <strong>Approved MP4</strong>
        <input
          type="file"
          accept="video/mp4,.mp4"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setStatus("idle");
            setError("");
            setResult(null);
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
          Keep this page open until it says <strong>Public MP4 ready</strong>.
        </p>
      ) : null}

      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}

      {result?.url ? (
        <div style={{ padding: 16, border: "1px solid currentColor", borderRadius: 12 }}>
          <strong>Public MP4 ready</strong>
          <p style={{ overflowWrap: "anywhere" }}>
            <a href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
          </p>
          <p>This permanent HTTPS URL is ready for the approved three-channel publish preflight.</p>
        </div>
      ) : null}
    </form>
  );
}
