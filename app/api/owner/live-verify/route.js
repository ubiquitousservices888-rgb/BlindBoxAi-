import { NextResponse } from "next/server";

import { verifyGitHubOidcRequest } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/owner-blue-live-verify-once.yml@refs/heads/main`;
const OIDC_AUDIENCE = "blindboxai-owner-live-verify";
const REVIEW_BUCKET_PREFIX =
  "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/";
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

function clean(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function validSourceUrl(value) {
  const raw = clean(value, 700);
  if (!raw.startsWith(REVIEW_BUCKET_PREFIX)) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || !/\.mp4$/i.test(url.pathname)) return "";
    return url.toString();
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

async function storageObjectIsGone(videoUrl) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const separator = videoUrl.includes("?") ? "&" : "?";
    const probeUrl = `${videoUrl}${separator}owner_blue_verify=${Date.now()}-${attempt}`;
    let response;
    try {
      response = await fetch(probeUrl, {
        method: "GET",
        headers: {
          Range: "bytes=0-0",
          "Cache-Control": "no-cache",
        },
        cache: "no-store",
      });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    if (!response.ok) return true;
    try { await response.body?.cancel(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return json({ error: "production_main_required" }, 403);
  }

  const oidc = await verifyGitHubOidcRequest(request, {
    audience: OIDC_AUDIENCE,
    repository: REPOSITORY,
    workflowRef: WORKFLOW_REF,
    allowedEvents: ["push"],
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

  const sourceVideoUrl = validSourceUrl(body?.sourceVideoUrl);
  const sourceTitle = clean(body?.sourceTitle, 80);
  const durationSeconds = Number(body?.durationSeconds);
  const width = Number(body?.width);
  const height = Number(body?.height);
  if (!sourceVideoUrl || !sourceTitle || ![durationSeconds, width, height].every((v) => Number.isFinite(v) && v > 0)) {
    return json({ error: "invalid_probe_metadata" }, 400);
  }

  const origin = new URL(request.url).origin;
  let stagedResearchRunId = "";
  let stagedVideoUrl = "";
  let deleteCompleted = false;

  try {
    const dashboardAuth = await apiJson(origin, "/api/owner/dashboard", { ownerCode });
    if (!dashboardAuth.response.ok) throw new Error("owner_dashboard_auth_failed");

    const baseline = await apiJson(origin, "/api/owner/review-queue", { ownerCode });
    if (!baseline.response.ok) throw new Error("review_queue_baseline_failed");
    const baselineItems = Array.isArray(baseline.data?.items) ? baseline.data.items : [];
    if (baselineItems.length !== 0) return json({ error: "review_queue_not_empty", count: baselineItems.length }, 409);

    const sourceResponse = await fetch(sourceVideoUrl, { cache: "no-store" });
    if (!sourceResponse.ok) throw new Error("source_video_unavailable");
    const bytes = new Uint8Array(await sourceResponse.arrayBuffer());
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_BYTES) throw new Error("source_video_size_invalid");

    const unique = `${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const path = `media/review/owner-blue-live-verify-${unique}.mp4`;
    const title = `Owner Blue Live Verify — ${sourceTitle}`.slice(0, 100);

    const ticket = await apiJson(origin, "/api/media/free-upload-ticket", {
      ownerCode,
      method: "POST",
      body: { path, sizeBytes: bytes.byteLength },
    });
    if (!ticket.response.ok || !ticket.data?.signedUrl || !ticket.data?.publicUrl) {
      throw new Error("upload_ticket_failed");
    }

    stagedVideoUrl = String(ticket.data.publicUrl);
    const staged = await apiJson(origin, "/api/owner/stage-review", {
      ownerCode,
      method: "POST",
      body: {
        videoUrl: stagedVideoUrl,
        title,
        sizeBytes: bytes.byteLength,
        durationSeconds,
        width,
        height,
      },
    });
    if (!staged.response.ok || staged.data?.state !== "READY_FOR_REVIEW") {
      throw new Error("review_stage_failed");
    }
    stagedResearchRunId = clean(staged.data?.researchRunId, 40);
    if (!/^rv-[a-f0-9]{16}$/.test(stagedResearchRunId)) throw new Error("invalid_staged_research_id");

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([bytes], { type: "video/mp4" }), "owner-blue-live-verify.mp4");
    const upload = await fetch(ticket.data.signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: form,
    });
    if (!upload.ok) throw new Error("signed_upload_failed");

    const liveQueue = await apiJson(origin, "/api/owner/review-queue", { ownerCode });
    if (!liveQueue.response.ok) throw new Error("review_queue_read_failed");
    const liveItems = Array.isArray(liveQueue.data?.items) ? liveQueue.data.items : [];
    const item = liveItems.find((row) => row?.research_run_id === stagedResearchRunId);
    if (!item) throw new Error("staged_item_not_visible");
    if (item.status !== "ready_for_review" || item.video_url !== stagedVideoUrl) throw new Error("staged_item_mismatch");
    if (!item.title || !item.created_at || Number(item.duration_seconds) <= 0 || Number(item.size_bytes) <= 0) {
      throw new Error("staged_item_metadata_missing");
    }

    const unauthorizedDelete = await apiJson(origin, "/api/owner/review-queue", {
      ownerCode: "owner-blue-live-verify-invalid",
      method: "DELETE",
      body: { researchRunId: stagedResearchRunId },
    });
    if (unauthorizedDelete.response.status !== 401) throw new Error("unauthorized_delete_not_blocked");

    const deleted = await apiJson(origin, "/api/owner/review-queue", {
      ownerCode,
      method: "DELETE",
      body: { researchRunId: stagedResearchRunId },
    });
    if (!deleted.response.ok || deleted.data?.deleted !== true) throw new Error("authorized_delete_failed");
    if (deleted.data?.item?.status !== "rejected" || deleted.data?.item?.rejection_reason !== "owner_rejected") {
      throw new Error("delete_audit_mismatch");
    }
    deleteCompleted = true;

    const storageDeleted = await storageObjectIsGone(stagedVideoUrl);
    if (!storageDeleted) throw new Error("deleted_storage_still_readable");

    const finalQueue = await apiJson(origin, "/api/owner/review-queue", { ownerCode });
    if (!finalQueue.response.ok) throw new Error("review_queue_final_failed");
    const finalItems = Array.isArray(finalQueue.data?.items) ? finalQueue.data.items : [];
    if (finalItems.some((row) => row?.research_run_id === stagedResearchRunId)) {
      throw new Error("deleted_item_still_visible");
    }

    return json({
      ok: true,
      revision: deployedRevision,
      dashboardAuthenticated: true,
      baselineReadyCount: 0,
      staged: true,
      researchRunId: stagedResearchRunId,
      queueVisible: true,
      metadataVisible: true,
      unauthorizedDeleteBlocked: true,
      deleted: true,
      storageDeleted: true,
      auditReason: "owner_rejected",
      finalReadyCount: finalItems.length,
      published: false,
    });
  } catch (error) {
    if (stagedResearchRunId && !deleteCompleted) {
      try {
        await apiJson(origin, "/api/owner/review-queue", {
          ownerCode,
          method: "DELETE",
          body: { researchRunId: stagedResearchRunId },
        });
      } catch {}
    }
    return json(
      {
        error: error instanceof Error ? error.message : "owner_blue_live_verify_failed",
        stagedResearchRunId: stagedResearchRunId || null,
        cleanupAttempted: Boolean(stagedResearchRunId && !deleteCompleted),
      },
      500,
    );
  }
}
