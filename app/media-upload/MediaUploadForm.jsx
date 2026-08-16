"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";

function safeName(name) {
  const base = String(name || "approved-video.mp4")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`;
}

export default function MediaUploadForm() {
  const [accessCode, setAccessCode] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
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
    try {
      const pathname = `media/approved/${Date.now()}-${safeName(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        clientPayload: JSON.stringify({ accessCode }),
        multipart: file.size > 100 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      setResult(blob);
      setAccessCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

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
          style={{ padding: 12, fontSize: 16 }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <strong>Approved MP4</strong>
        <input
          type="file"
          accept="video/mp4,.mp4"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
          style={{ padding: 12 }}
        />
      </label>

      <button type="submit" disabled={busy} style={{ padding: 14, fontSize: 16, fontWeight: 700 }}>
        {busy ? `Uploading ${progress}%` : "Upload approved video"}
      </button>

      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}

      {result?.url ? (
        <div style={{ padding: 16, border: "1px solid currentColor", borderRadius: 12 }}>
          <strong>Public MP4 ready</strong>
          <p style={{ overflowWrap: "anywhere" }}>
            <a href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
          </p>
          <p>This URL is the media URL to use for the approved Buffer/TikTok publish step.</p>
        </div>
      ) : null}
    </form>
  );
}
