import { get, list, put } from "@vercel/blob";

import {
  epnApiConfigured,
  epnReportingCredentials,
  fetchEpnPerformanceByDay,
} from "./epn-reporting-api.mjs";
import {
  buildDashboardEtag,
  CLICK_DISPLAY_LIMIT,
  countBlobsInWindow,
  DASHBOARD_LOOKBACK_DAYS,
  listRecentBlobMetadata,
  newestBlobs,
  NOTIFICATION_DISPLAY_LIMIT,
  requestEtagMatches,
} from "./owner-dashboard-core.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const EPN_API_REFRESH_MS = 60 * 60 * 1000;
const EPN_REPORT_BLOB = "owner/epn-report/latest.json";

async function readJsonBlob(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  try {
    return await new Response(result.stream).json();
  } catch {
    return null;
  }
}

async function readOptionalJsonBlob(pathname) {
  try {
    return await readJsonBlob(pathname);
  } catch {
    return null;
  }
}

async function readSelectedEvents(blobs) {
  const events = await Promise.all(blobs.map(async (blob) => {
    const event = await readJsonBlob(blob.pathname);
    return event ? { ...event, pathname: blob.pathname } : null;
  }));
  return events.filter(Boolean);
}

function epnApiReportIsFresh(report, now) {
  if (!report || report.source !== "ebay_partner_network_api") return false;
  const timestamp = new Date(report.refreshedAt || report.importedAt || 0).getTime();
  return Number.isFinite(timestamp) && now.getTime() - timestamp < EPN_API_REFRESH_MS;
}

async function refreshEpnReportIfNeeded(cachedReport, now) {
  if (!epnApiConfigured() || epnApiReportIsFresh(cachedReport, now)) return cachedReport;

  const { accountSid, authToken } = epnReportingCredentials();
  try {
    const report = await fetchEpnPerformanceByDay({ accountSid, authToken, now });
    await put(EPN_REPORT_BLOB, JSON.stringify(report, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return report;
  } catch (error) {
    console.error("epn_dashboard_auto_refresh_failed", {
      message: error instanceof Error ? error.message : "Unknown EPN reporting error",
    });
    return cachedReport;
  }
}

export function reportingStatus(epnReport = null) {
  return {
    epn: epnReport ? {
      status: epnReport.status || "Connected from EPN report",
      orders: Number.isFinite(epnReport.orders) ? epnReport.orders : null,
      earnings: Number.isFinite(epnReport.earnings) ? epnReport.earnings : null,
      epc: Number.isFinite(epnReport.epc) ? epnReport.epc : null,
      networkClicks: Number.isFinite(epnReport.networkClicks) ? epnReport.networkClicks : null,
      importedAt: epnReport.importedAt || null,
      source: epnReport.source || "ebay_partner_network_csv",
    } : {
      status: "Reporting not connected",
      orders: null,
      earnings: null,
      epc: null,
      networkClicks: null,
      importedAt: null,
      source: null,
    },
    amazon: {
      status: "Affiliate links active; reporting pending Amazon approval",
      orders: null,
      earnings: null,
      epc: null,
    },
  };
}

export async function getOwnerDashboardSnapshot({ ifNoneMatch = "" } = {}) {
  const now = new Date();
  const [clickBlobs, notificationBlobs, cachedEpnReport] = await Promise.all([
    listRecentBlobMetadata({ listPage: list, prefix: "affiliate/clicks/", now }),
    listRecentBlobMetadata({ listPage: list, prefix: "owner/notifications/", now }),
    readOptionalJsonBlob(EPN_REPORT_BLOB),
  ]);
  const epnReport = await refreshEpnReportIfNeeded(cachedEpnReport, now);

  const visibleClickBlobs = newestBlobs(clickBlobs, CLICK_DISPLAY_LIMIT);
  const visibleNotificationBlobs = newestBlobs(notificationBlobs, NOTIFICATION_DISPLAY_LIMIT);
  const clickLast24h = countBlobsInWindow(clickBlobs, {
    from: new Date(now.getTime() - DAY_MS),
    through: now,
  });
  const revenue = reportingStatus(epnReport);

  const etag = buildDashboardEtag({
    clickCount: clickBlobs.length,
    clickLast24h,
    notificationCount: notificationBlobs.length,
    visibleClickBlobs,
    visibleNotificationBlobs,
    revenueSignature: revenue.epn,
  });

  if (requestEtagMatches(ifNoneMatch, etag)) {
    return { etag, notModified: true, snapshot: null };
  }

  const [epnClicks, notifications] = await Promise.all([
    readSelectedEvents(visibleClickBlobs),
    readSelectedEvents(visibleNotificationBlobs),
  ]);

  return {
    etag,
    notModified: false,
    snapshot: {
      generatedAt: now.toISOString(),
      window: { lookbackDays: DASHBOARD_LOOKBACK_DAYS },
      totals: {
        epnClicksLoaded: clickBlobs.length,
        epnClicksLast24h: clickLast24h,
        notificationsLoaded: notificationBlobs.length,
      },
      revenue,
      notifications,
      epnClicks,
    },
  };
}
