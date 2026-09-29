import { NextResponse } from "next/server";

import { requirePublicVideoTitle } from "../../../../lib/public-video-title.mjs";
import { assertYoutubeShortsMetadata } from "../../../../lib/review-shorts-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/autonomous-video.yml@refs/heads/main`;
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_AUDIENCE = "blindboxai-autonomous-render-stage";
const OIDC_JWKS = "https://token.actions.githubusercontent.com/.well-known/jwks";
const VIDEO_UPLOAD_BROKER_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/blindbox-video-upload";
const MAX_BYTES = 100 * 1024 * 1024;

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parseJwtPart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

async function verifyGitHubOidc(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJwtPart(encodedHeader);
    const payload = parseJwtPart(encodedPayload);
    if (header?.alg !== "RS256" || !header?.kid) return null;

    const jwksResponse = await fetch(OIDC_JWKS, { cache: "no-store" });
    if (!jwksResponse.ok) return null;
    const jwks = await jwksResponse.json();
    const jwk = Array.isArray(jwks?.keys)
      ? jwks.keys.find((candidate) => candidate?.kid === header.kid && candidate?.kty === "RSA")
      : null;
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      Buffer.from(encodedSignature, "base64url"),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!verified) return null;

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== OIDC_ISSUER) return null;
    if (!audiences.includes(OIDC_AUDIENCE)) return null;
    if (payload.repository !== REPOSITORY) return null;
    if (payload.ref !== "refs/heads/main") return null;
    if (payload.workflow_ref !== WORKFLOW_REF) return null;
    if (!["push", "workflow_dispatch"].includes(String(payload.event_name || ""))) return null;
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now) return null;
    if (payload.nbf && Number(payload.nbf) > now) return null;
    if (!/^[0-9a-f]{40}$/.test(String(payload.sha || ""))) return null;
    return payload;
  } catch {
    return null;
  }
}

function allowedSourceVideoUrl(value) {
  const raw = clean(value, 1000);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || !/\.mp4$/i.test(url.pathname)) return "";

    const host = url.hostname.toLowerCase();
    const creatomateBackblaze =
      /^f\d{3}\.backblazeb2\.com$/.test(host) &&
      url.pathname.startsWith("/file/creatomate-");
    const creatomateCdn =
      host === "cdn.creatomate.com" &&
      url.pathname.startsWith("/renders/");
    const vercelBlob =
      host.endsWith(".public.blob.vercel-storage.com");

    return creatomateBackblaze || creatomateCdn || vercelBlob ? url.toString() : "";
  } catch {
    return "";
  }
}

async function apiJson(origin, path, { ownerCode, method = "GET", body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(ownerCode ? { Authorization: `Bearer ${ownerCode}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function readBoundedResponseBytes(response, maxBytes) {
  if (!response.body) throw new Error("source_video_body_missing");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel("source_video_size_invalid"); } catch {}
        throw new Error("source_video_size_invalid");
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  if (total <= 0) throw new Error("source_video_size_invalid");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function cleanupStagedReview(origin, ownerCode, researchRunId) {
  if (!researchRunId) return;
  try {
    await apiJson(origin, "/api/owner/review-queue", {
      ownerCode,
      method: "DELETE",
      body: { researchRunId },
    });
  } catch {}
}

async function cleanupStorageObject(ownerCode, path) {
  if (!path) return false;
  try {
    const response = await fetch(VIDEO_UPLOAD_BROKER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "delete", path }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    return response.ok && result?.deleted === true;
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return json({ error: "production_main_required" }, 403);
  }

  const oidc = await verifyGitHubOidc(request);
  if (!oidc) return json({ error: "github_oidc_required" }, 401);

  const deployedRevision = String(process.env.VERCEL_GIT_COMMIT_SHA || "");
  if (!/^[0-9a-f]{40}$/.test(deployedRevision) || deployedRevision !== oidc.sha) {
    return json({ error: "production_revision_not_ready" }, 409);
  }

  const ownerCode = String(process.env.OWNER_CONTROL_CODE || "");
  if (!ownerCode) return json({ error: "owner_control_not_configured" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const sourceVideoUrl = allowedSourceVideoUrl(body?.sourceVideoUrl);
  let title;
  try {
    title = requirePublicVideoTitle(body?.title, { label: "Video title", maxLength: 100 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_title" }, 400);
  }

  const reportedSizeBytes = Number(body?.sizeBytes);
  const durationSeconds = Number(body?.durationSeconds);
  const width = Number(body?.width);
  const height = Number(body?.height);
  if (!sourceVideoUrl || !Number.isFinite(reportedSizeBytes) || reportedSizeBytes <= 0 || reportedSizeBytes > MAX_BYTES) {
    return json({ error: "invalid_render_metadata" }, 400);
  }

  try {
    assertYoutubeShortsMetadata({ durationSeconds, width, height });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_probe_metadata" }, 400);
  }

  const origin = new URL(request.url).origin;
  let stagedResearchRunId = "";
  let uploadedPath = "";

  try {
    const sourceResponse = await fetch(sourceVideoUrl, {
      redirect: "error",
      cache: "no-store",
    });
    if (!sourceResponse.ok) throw new Error("source_video_unavailable");

    const contentLength = Number(sourceResponse.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      throw new Error("source_video_size_invalid");
    }

    const bytes = await readBoundedResponseBytes(sourceResponse, MAX_BYTES);
    if (bytes.byteLength !== Math.round(reportedSizeBytes)) {
      throw new Error("source_video_size_mismatch");
    }

    const unique = `${String(oidc.sha).slice(0, 12)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const path = `media/review/autonomous-${unique}.mp4`;

    const ticket = await apiJson(origin, "/api/media/free-upload-ticket", {
      ownerCode,
      method: "POST",
      body: { path, sizeBytes: bytes.byteLength },
    });
    if (!ticket.response.ok || !ticket.data?.signedUrl || !ticket.data?.publicUrl) {
      throw new Error("upload_ticket_failed");
    }

    const canonicalVideoUrl = String(ticket.data.publicUrl);
    uploadedPath = clean(ticket.data?.path || path, 180);
    if (uploadedPath !== path) throw new Error("upload_ticket_path_mismatch");

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([bytes], { type: "video/mp4" }), "autonomous-review.mp4");
    const upload = await fetch(ticket.data.signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: form,
    });
    if (!upload.ok) throw new Error("signed_upload_failed");

    const probe = await fetch(canonicalVideoUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0", "Cache-Control": "no-cache" },
      cache: "no-store",
    });
    if (!probe.ok) throw new Error("canonical_video_unavailable");
    try { await probe.body?.cancel(); } catch {}

    const staged = await apiJson(origin, "/api/owner/stage-review", {
      ownerCode,
      method: "POST",
      body: {
        videoUrl: canonicalVideoUrl,
        title,
        sizeBytes: bytes.byteLength,
        durationSeconds,
        width,
        height,
      },
    });
    stagedResearchRunId = clean(staged.data?.researchRunId, 40);
    if (!staged.response.ok || staged.data?.state !== "READY_FOR_REVIEW") {
      throw new Error("review_stage_failed");
    }

    const campaignId = clean(staged.data?.campaignId, 100);
    if (!/^rv-[a-f0-9]{16}$/.test(stagedResearchRunId)) {
      throw new Error("invalid_staged_research_id");
    }
    if (campaignId !== `bb-${stagedResearchRunId}`) {
      throw new Error("invalid_staged_campaign_id");
    }

    return json({
      ok: true,
      state: "READY_FOR_REVIEW",
      revision: deployedRevision,
      sourceVideoUrl,
      videoUrl: canonicalVideoUrl,
      researchRunId: stagedResearchRunId,
      campaignId,
      sizeBytes: bytes.byteLength,
      durationSeconds,
      width,
      height,
      approved: false,
      published: false,
    });
  } catch (error) {
    if (stagedResearchRunId) {
      await cleanupStagedReview(origin, ownerCode, stagedResearchRunId);
    }
    const storageCleanupCompleted = uploadedPath
      ? await cleanupStorageObject(ownerCode, uploadedPath)
      : false;
    return json({
      error: error instanceof Error ? error.message : "render_staging_failed",
      cleanupAttempted: Boolean(stagedResearchRunId || uploadedPath),
      storageCleanupCompleted,
    }, 502);
  }
}
