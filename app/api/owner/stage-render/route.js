import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { verifyGitHubOidcRequest } from "../../../../lib/github-oidc.mjs";
import { resolvePublicVideoTitle } from "../../../../lib/public-video-title.mjs";
import { assertYoutubeShortsMetadata } from "../../../../lib/review-shorts-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/autonomous-video.yml@refs/heads/main`;
const OIDC_AUDIENCE = "blindboxai-autonomous-render-stage";
const VIDEO_UPLOAD_BROKER_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/blindbox-video-upload";
const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";
const REVIEW_OBJECT_PREFIX =
  "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/";
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
    const vercelBlob = host.endsWith(".public.blob.vercel-storage.com");
    return creatomateBackblaze || creatomateCdn || vercelBlob ? url.toString() : "";
  } catch {
    return "";
  }
}

function canonicalReviewVideoUrl(value) {
  const raw = clean(value, 1000);
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.search ||
      url.hash ||
      !url.toString().startsWith(`${REVIEW_OBJECT_PREFIX}media/review/`) ||
      !/\.mp4$/i.test(url.pathname)
    ) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeReviewPath(value) {
  const path = clean(value, 240);
  return /^media\/review\/[a-zA-Z0-9._-]+\.mp4$/i.test(path) ? path : "";
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
  if (!response.body) throw new Error("video_body_missing");
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
        try { await reader.cancel("video_size_invalid"); } catch {}
        throw new Error("video_size_invalid");
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (total <= 0) throw new Error("video_size_invalid");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function reviewQueue(ownerCode, body) {
  const response = await fetch(REVIEW_QUEUE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ownerCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function storageBroker(ownerCode, body) {
  const response = await fetch(VIDEO_UPLOAD_BROKER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ownerCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function cleanupStorageObject(ownerCode, path) {
  if (!path) return false;
  try {
    const result = await storageBroker(ownerCode, { action: "delete", path });
    return result.response.ok && result.data?.deleted === true;
  } catch {
    return false;
  }
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

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return json({ error: "production_main_required" }, 403);
  }

  const oidc = await verifyGitHubOidcRequest(request, {
    audience: OIDC_AUDIENCE,
    repository: REPOSITORY,
    workflowRef: WORKFLOW_REF,
    allowedEvents: ["push", "workflow_dispatch"],
  });
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid_request" }, 400);
  }

  const action = clean(body.action, 20);
  const origin = new URL(request.url).origin;

  if (action === "cleanup") {
    const path = safeReviewPath(body.path);
    const videoUrl = canonicalReviewVideoUrl(body.videoUrl);
    if (!path || !videoUrl || videoUrl !== `${REVIEW_OBJECT_PREFIX}${path}`) {
      return json({ error: "invalid_cleanup_target" }, 400);
    }
    const deleted = await cleanupStorageObject(ownerCode, path);
    return json({ deleted, path, videoUrl }, deleted ? 200 : 502);
  }

  if (action === "approve") {
    if (oidc.event_name !== "workflow_dispatch") {
      return json({ error: "manual_dispatch_required" }, 403);
    }
    const researchRunId = clean(body.researchRunId, 40);
    const videoUrl = canonicalReviewVideoUrl(body.videoUrl);
    if (!/^rv-[a-f0-9]{16}$/.test(researchRunId) || !videoUrl) {
      return json({ error: "invalid_approval_target" }, 400);
    }
    const approved = await reviewQueue(ownerCode, { action: "approve", videoUrl });
    if (!approved.response.ok || approved.data?.state !== "APPROVED") {
      return json({ error: approved.data?.error || "review_approval_failed" }, approved.response.status || 502);
    }
    if (approved.data?.research_run_id !== researchRunId || approved.data?.video_url !== videoUrl) {
      return json({ error: "approved_review_identity_mismatch" }, 409);
    }
    return json({
      ok: true,
      state: "APPROVED",
      researchRunId,
      videoUrl,
      campaignId: `bb-${researchRunId}`,
    });
  }

  const title = resolvePublicVideoTitle(body.title, { maxLength: 100 });

  const sizeBytes = Number(body.sizeBytes);
  const durationSeconds = Number(body.durationSeconds);
  const width = Number(body.width);
  const height = Number(body.height);
  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_BYTES
  ) {
    return json({ error: "invalid_video_metadata" }, 400);
  }
  try {
    assertYoutubeShortsMetadata({ durationSeconds, width, height });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_probe_metadata" }, 400);
  }

  if (action === "upload") {
    const sourceVideoUrl = allowedSourceVideoUrl(body.sourceVideoUrl);
    if (!sourceVideoUrl) return json({ error: "invalid_render_source" }, 400);

    let uploadedPath = "";
    try {
      const sourceResponse = await fetch(sourceVideoUrl, { redirect: "error", cache: "no-store" });
      if (!sourceResponse.ok) throw new Error("source_video_unavailable");
      const advertised = Number(sourceResponse.headers.get("content-length") || 0);
      if (Number.isFinite(advertised) && advertised > MAX_BYTES) {
        throw new Error("source_video_size_invalid");
      }
      const bytes = await readBoundedResponseBytes(sourceResponse, MAX_BYTES);
      if (bytes.byteLength !== Math.round(sizeBytes)) {
        throw new Error("source_video_size_mismatch");
      }

      const path = `media/review/autonomous-${String(oidc.sha).slice(0, 12)}-${randomUUID().replace(/-/g, "").slice(0, 12)}.mp4`;
      const ticket = await apiJson(origin, "/api/media/free-upload-ticket", {
        ownerCode,
        method: "POST",
        body: { path, sizeBytes: bytes.byteLength },
      });
      if (!ticket.response.ok || !ticket.data?.signedUrl || !ticket.data?.publicUrl) {
        throw new Error("upload_ticket_failed");
      }
      if (ticket.data?.path !== path) throw new Error("upload_ticket_path_mismatch");

      const canonicalVideoUrl = canonicalReviewVideoUrl(ticket.data.publicUrl);
      const expectedUrl = `${REVIEW_OBJECT_PREFIX}${path}`;
      if (!canonicalVideoUrl || canonicalVideoUrl !== expectedUrl) {
        throw new Error("upload_ticket_public_url_invalid");
      }

      uploadedPath = path;
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", new Blob([bytes], { type: "video/mp4" }), "autonomous-review.mp4");
      const upload = await fetch(ticket.data.signedUrl, {
        method: "PUT",
        headers: { "x-upsert": "false" },
        body: form,
      });
      if (!upload.ok) throw new Error("signed_upload_failed");

      return json({
        ok: true,
        state: "CANONICAL_UPLOADED",
        revision: deployedRevision,
        sourceVideoUrl,
        videoUrl: canonicalVideoUrl,
        path,
        sizeBytes: bytes.byteLength,
        approved: false,
        published: false,
      });
    } catch (error) {
      const storageCleanupCompleted = uploadedPath
        ? await cleanupStorageObject(ownerCode, uploadedPath)
        : false;
      return json({
        error: error instanceof Error ? error.message : "render_upload_failed",
        cleanupAttempted: Boolean(uploadedPath),
        storageCleanupCompleted,
      }, 502);
    }
  }

  if (action === "stage") {
    const path = safeReviewPath(body.path);
    const canonicalVideoUrl = canonicalReviewVideoUrl(body.videoUrl);
    const expectedHash = clean(body.sha256, 64).toLowerCase();
    if (
      !path ||
      !canonicalVideoUrl ||
      canonicalVideoUrl !== `${REVIEW_OBJECT_PREFIX}${path}` ||
      !/^[a-f0-9]{64}$/.test(expectedHash)
    ) {
      return json({ error: "invalid_canonical_video" }, 400);
    }

    const deterministicResearchRunId = `rv-${createHash("sha256").update(canonicalVideoUrl).digest("hex").slice(0, 16)}`;
    let stagedResearchRunId = deterministicResearchRunId;
    try {
      const canonicalResponse = await fetch(canonicalVideoUrl, { cache: "no-store" });
      if (!canonicalResponse.ok) throw new Error("canonical_video_unavailable");
      const bytes = await readBoundedResponseBytes(canonicalResponse, MAX_BYTES);
      if (bytes.byteLength !== Math.round(sizeBytes)) {
        throw new Error("canonical_video_size_mismatch");
      }
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== expectedHash) throw new Error("canonical_video_hash_mismatch");

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
      const returnedResearchRunId = clean(staged.data?.researchRunId, 40);
      if (!staged.response.ok || staged.data?.state !== "READY_FOR_REVIEW") {
        throw new Error("review_stage_failed");
      }
      if (returnedResearchRunId !== deterministicResearchRunId) {
        throw new Error("staged_research_id_mismatch");
      }
      stagedResearchRunId = returnedResearchRunId;

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
        videoUrl: canonicalVideoUrl,
        path,
        researchRunId: stagedResearchRunId,
        campaignId,
        sha256: actualHash,
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
      const storageCleanupCompleted = await cleanupStorageObject(ownerCode, path);
      return json({
        error: error instanceof Error ? error.message : "render_staging_failed",
        cleanupAttempted: true,
        storageCleanupCompleted,
      }, 502);
    }
  }

  return json({ error: "invalid_action" }, 400);
}
