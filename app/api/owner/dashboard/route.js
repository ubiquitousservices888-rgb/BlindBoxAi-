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
const DASHBOARD_CACHE_MS = 5 * 60 * 1000;
const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";

let cachedDashboard = null;
let cachedDashboardAt = 0;
let dashboardRefreshInFlight = null;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

function degradedSnapshot(message) {
  const generatedAt = new Date().toISOString();
  return {
    etag: `W/\"degraded-${Date.now()}\"`,
    notModified: false,
    snapshot: {
      generatedAt,
      window: { lookbackDays: 30 },
      totals: { epnClicksLoaded: 0, epnClicksLast24h: 0, notificationsLoaded: 0, analyticsEventsLoaded: 0, analyticsEventsLast24h: 0 },
      attribution: { byVertical: {}, byProvider: {} },
      revenue: {
        epn: { status: "Reporting temporarily unavailable", orders: null, earnings: null, epc: null, networkClicks: null },
        amazon: { status: "Reporting temporarily unavailable", orders: null, earnings: null, epc: null, networkClicks: null },
      },
      dailyRevenue: [],
      notifications: [{ event: "dashboard_dependency_warning", message, approved: true, createdAt: generatedAt }],
      epnClicks: [],
    },
  };
}

async function refreshDashboardSnapshot(ownerCode) {
  if (!dashboardRefreshInFlight) {
    dashboardRefreshInFlight = getOwnerDashboardSnapshot({ ifNoneMatch: "", ownerCode })
      .catch((error) => {
        console.error("owner_dashboard_snapshot_degraded", { message: error instanceof Error ? error.message : "Unknown dashboard dependency error" });
        return degradedSnapshot("Dashboard opened, but telemetry/reporting data is temporarily unavailable.");
      })
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

async function dashboardResult(ifNoneMatch, ownerCode) {
  const now = Date.now();
  const forceRefresh = !ifNoneMatch;
  const cacheExpired = !cachedDashboard || now - cachedDashboardAt >= DASHBOARD_CACHE_MS;
  if (forceRefresh || cacheExpired) {
    const fresh = await refreshDashboardSnapshot(ownerCode);
    if (ifNoneMatch && requestEtagMatches(ifNoneMatch, fresh.etag)) return { etag: fresh.etag, notModified: true, snapshot: null };
    return fresh;
  }
  return cachedDashboard;
}

async function loadReviewQueue(ownerCode) {
  const response = await fetch(REVIEW_QUEUE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerCode}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list" }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Review queue lookup failed (${response.status}).`);
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
    const result = await dashboardResult(request.headers.get("if-none-match") || "", token);
    const baseSnapshot = result.snapshot ?? cachedDashboard?.snapshot;
    if (!baseSnapshot) throw new Error("Dashboard snapshot unavailable.");

    let queueItems = [];
    let queueWarning = null;
    try {
      queueItems = await loadReviewQueue(token);
    } catch (error) {
      console.error("owner_review_queue_degraded", { message: error instanceof Error ? error.message : "Unknown review queue error" });
      queueWarning = { event: "review_queue_warning", message: "Dashboard opened, but the review queue is temporarily unavailable.", approved: true, createdAt: new Date().toISOString() };
    }

    const queueNotifications = reviewNotifications(queueItems);
    const snapshot = {
      ...baseSnapshot,
      notifications: [...queueNotifications, ...(queueWarning ? [queueWarning] : []), ...(Array.isArray(baseSnapshot.notifications) ? baseSnapshot.notifications : [])],
    };

    const headers = { ...PRIVATE_HEADERS, ETag: result.etag || cachedDashboard?.etag || "" };
    return NextResponse.json(snapshot, { headers });
  } catch (error) {
    console.error("owner_dashboard_load_failed", { message: error instanceof Error ? error.message : "Unknown dashboard error" });
    return NextResponse.json({ error: "Dashboard data unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
