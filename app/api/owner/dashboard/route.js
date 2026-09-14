import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";
import { getOwnerDashboardSnapshot } from "../../../../lib/owner-dashboard";
import { requestEtagMatches } from "../../../../lib/owner-dashboard-core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};
const DASHBOARD_BLOB_CACHE_MS = 5 * 60 * 1000;
const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";

let cachedDashboard = null;
let cachedDashboardAt = 0;
let dashboardRefreshInFlight = null;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: PRIVATE_HEADERS },
  );
}

async function refreshDashboardSnapshot() {
  if (!dashboardRefreshInFlight) {
    dashboardRefreshInFlight = getOwnerDashboardSnapshot({ ifNoneMatch: "" })
      .then((fresh) => {
        cachedDashboard = fresh;
        cachedDashboardAt = Date.now();
        return fresh;
      })
      .finally(() => {
        dashboardRefreshInFlight = null;
      });
  }

  return dashboardRefreshInFlight;
}

async function dashboardResult(ifNoneMatch) {
  const now = Date.now();
  const forceRefresh = !ifNoneMatch;
  const cacheExpired = !cachedDashboard || now - cachedDashboardAt >= DASHBOARD_BLOB_CACHE_MS;

  if (forceRefresh || cacheExpired) {
    const fresh = await refreshDashboardSnapshot();
    if (ifNoneMatch && requestEtagMatches(ifNoneMatch, fresh.etag)) {
      return { etag: fresh.etag, notModified: true, snapshot: null };
    }
    return fresh;
  }

  return cachedDashboard;
}

async function loadReviewQueue(ownerCode) {
  const response = await fetch(REVIEW_QUEUE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ownerCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "list" }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || `Review queue lookup failed (${response.status}).`);
  }
  return Array.isArray(body?.items) ? body.items : [];
}

function reviewNotifications(items) {
  return items.map((item) => ({
    event: "review_video_queue",
    message: item.title || "Owner review video",
    reviewState: item.status === "ready_for_review" ? "READY_FOR_REVIEW" : String(item.status || "").toUpperCase(),
    approved: item.status !== "ready_for_review",
    mediaUrl: item.video_url,
    researchRunId: item.research_run_id,
    vertical: item.vertical,
    sizeBytes: item.size_bytes,
    durationSeconds: item.duration_seconds,
    width: item.width,
    height: item.height,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  try {
    assertUploadCode(token);
  } catch {
    return unauthorized();
  }

  try {
    const result = await dashboardResult(request.headers.get("if-none-match") || "");
    const baseSnapshot = result.snapshot ?? cachedDashboard?.snapshot;
    if (!baseSnapshot) throw new Error("Dashboard snapshot unavailable.");

    const queueItems = await loadReviewQueue(token);
    const queueNotifications = reviewNotifications(queueItems);
    const snapshot = {
      ...baseSnapshot,
      notifications: [
        ...queueNotifications,
        ...(Array.isArray(baseSnapshot.notifications) ? baseSnapshot.notifications : []),
      ],
    };

    // Review-queue state changes independently of the legacy dashboard snapshot,
    // so return 200 even when the legacy ETag has not changed.
    const headers = { ...PRIVATE_HEADERS, ETag: result.etag || cachedDashboard?.etag || "" };
    return NextResponse.json(snapshot, { headers });
  } catch (error) {
    console.error("owner_dashboard_load_failed", {
      message: error instanceof Error ? error.message : "Unknown dashboard error",
    });
    return NextResponse.json(
      { error: "Dashboard data unavailable." },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }
}
