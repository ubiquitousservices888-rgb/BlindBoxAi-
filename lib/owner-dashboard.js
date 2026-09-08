import { get, list } from "@vercel/blob";

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
const EPN_REPORT_BLOB = "owner/epn-report/latest.json";
const AMAZON_REPORT_BLOB = "owner/amazon-report/latest.json";
const DAILY_DAYS = 30;

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

function networkStatus(report, fallback) {
  return report?.status || fallback;
}

export function reportingStatus(epnReport = null, amazonReport = null) {
  return {
    epn: epnReport ? {
      status: networkStatus(epnReport, "Connected from EPN report"),
      orders: Number.isFinite(epnReport.orders) ? epnReport.orders : null,
      earnings: Number.isFinite(epnReport.earnings) ? epnReport.earnings : null,
      epc: Number.isFinite(epnReport.epc) ? epnReport.epc : null,
      networkClicks: Number.isFinite(epnReport.networkClicks) ? epnReport.networkClicks : null,
      importedAt: epnReport.importedAt || null,
      source: epnReport.source || "ebay_partner_network_csv",
      payoutTiming: "eBay pays monthly, generally on or around the 10th business day, subject to the account minimum and payment setup.",
    } : {
      status: "Reporting not connected",
      orders: null,
      earnings: null,
      epc: null,
      networkClicks: null,
      importedAt: null,
      source: null,
      payoutTiming: "eBay pays monthly, generally on or around the 10th business day, subject to the account minimum and payment setup.",
    },
    amazon: amazonReport ? {
      status: networkStatus(amazonReport, "Connected from Amazon Associates report"),
      orders: Number.isFinite(amazonReport.orders) ? amazonReport.orders : null,
      earnings: Number.isFinite(amazonReport.earnings) ? amazonReport.earnings : null,
      epc: Number.isFinite(amazonReport.epc) ? amazonReport.epc : null,
      networkClicks: Number.isFinite(amazonReport.networkClicks) ? amazonReport.networkClicks : null,
      importedAt: amazonReport.importedAt || null,
      source: amazonReport.source || "amazon_associates_report",
      payoutTiming: "Amazon Associates pays approximately 60 days after the end of the month in which the commissions were earned, subject to the payment threshold and account requirements.",
    } : {
      status: "Affiliate links active; Amazon report not imported",
      orders: null,
      earnings: null,
      epc: null,
      networkClicks: null,
      importedAt: null,
      source: null,
      payoutTiming: "Amazon Associates pays approximately 60 days after the end of the month in which the commissions were earned, subject to the payment threshold and account requirements.",
    },
  };
}

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function emptyDailyRow(date) {
  return {
    date,
    eBay: { clicks: null, orders: null, earnings: null },
    amazon: { clicks: null, orders: null, earnings: null },
  };
}

function buildDailyRevenue(now, epnReport, amazonReport) {
  const rows = new Map();
  for (let offset = DAILY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = dateKey(new Date(now.getTime() - offset * DAY_MS));
    rows.set(date, emptyDailyRow(date));
  }

  for (const item of epnReport?.daily || []) {
    if (!rows.has(item.date)) continue;
    const row = rows.get(item.date);
    row.eBay = {
      clicks: Number.isFinite(item.clicks) ? item.clicks : null,
      orders: Number.isFinite(item.orders) ? item.orders : null,
      earnings: Number.isFinite(item.earnings) ? item.earnings : null,
    };
  }

  for (const item of amazonReport?.daily || []) {
    if (!rows.has(item.date)) continue;
    const row = rows.get(item.date);
    row.amazon = {
      clicks: Number.isFinite(item.clicks) ? item.clicks : null,
      orders: Number.isFinite(item.orders) ? item.orders : null,
      earnings: Number.isFinite(item.earnings) ? item.earnings : null,
    };
  }

  return [...rows.values()].reverse();
}

export async function getOwnerDashboardSnapshot({ ifNoneMatch = "" } = {}) {
  const now = new Date();
  const [clickBlobs, notificationBlobs, cachedEpnReport, amazonReport] = await Promise.all([
    listRecentBlobMetadata({ listPage: list, prefix: "affiliate/clicks/", now }),
    listRecentBlobMetadata({ listPage: list, prefix: "owner/notifications/", now }),
    readOptionalJsonBlob(EPN_REPORT_BLOB),
    readOptionalJsonBlob(AMAZON_REPORT_BLOB),
  ]);
  const epnReport = cachedEpnReport;

  const visibleClickBlobs = newestBlobs(clickBlobs, CLICK_DISPLAY_LIMIT);
  const visibleNotificationBlobs = newestBlobs(notificationBlobs, NOTIFICATION_DISPLAY_LIMIT);
  const clickLast24h = countBlobsInWindow(clickBlobs, {
    from: new Date(now.getTime() - DAY_MS),
    through: now,
  });
  const revenue = reportingStatus(epnReport, amazonReport);

  const etag = buildDashboardEtag({
    clickCount: clickBlobs.length,
    clickLast24h,
    notificationCount: notificationBlobs.length,
    visibleClickBlobs,
    visibleNotificationBlobs,
    revenueSignature: { epn: revenue.epn, amazon: revenue.amazon },
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
      dailyRevenue: buildDailyRevenue(now, epnReport, amazonReport),
      notifications,
      epnClicks,
    },
  };
}
