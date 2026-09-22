import { get } from "@vercel/blob";

import {
  buildDashboardEtag,
  CLICK_DISPLAY_LIMIT,
  DASHBOARD_LOOKBACK_DAYS,
  requestEtagMatches,
} from "./owner-dashboard-core.mjs";
import { getDistributionTelemetry } from "./supabase-telemetry.mjs";

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

function clickIdentity(click) {
  return {
    pathname: String(click?.customId || click?.id || ""),
    etag: "",
    size: 0,
    uploadedAt: click?.clickedAt || null,
  };
}

export async function getOwnerDashboardSnapshot({ ifNoneMatch = "", ownerCode = "" } = {}) {
  const now = new Date();
  const [telemetry, epnReport, amazonReport] = await Promise.all([
    getDistributionTelemetry({ ownerCode, lookbackDays: DASHBOARD_LOOKBACK_DAYS, recentLimit: CLICK_DISPLAY_LIMIT }),
    readOptionalJsonBlob(EPN_REPORT_BLOB),
    readOptionalJsonBlob(AMAZON_REPORT_BLOB),
  ]);

  const epnClicks = Array.isArray(telemetry?.recentClicks) ? telemetry.recentClicks : [];
  const clickCount = Number(telemetry?.clicksLoaded || 0);
  const clickLast24h = Number(telemetry?.clicksLast24h || 0);
  const revenue = reportingStatus(epnReport, amazonReport);
  const etag = buildDashboardEtag({
    clickCount,
    clickLast24h,
    notificationCount: 0,
    visibleClickBlobs: epnClicks.map(clickIdentity),
    visibleNotificationBlobs: [],
    revenueSignature: { epn: revenue.epn, amazon: revenue.amazon },
  });

  if (requestEtagMatches(ifNoneMatch, etag)) {
    return { etag, notModified: true, snapshot: null };
  }

  return {
    etag,
    notModified: false,
    snapshot: {
      generatedAt: now.toISOString(),
      window: { lookbackDays: DASHBOARD_LOOKBACK_DAYS },
      totals: {
        epnClicksLoaded: clickCount,
        epnClicksLast24h: clickLast24h,
        notificationsLoaded: 0,
        analyticsEventsLoaded: Number(telemetry?.analyticsLoaded || 0),
        analyticsEventsLast24h: Number(telemetry?.analyticsLast24h || 0),
      },
      attribution: {
        byVertical: telemetry?.byVertical || {},
        byProvider: telemetry?.byProvider || {},
      },
      funnel: telemetry?.funnel || {
        pageViews: 0,
        landingSources: 0,
        questions: 0,
        confirmedSignups: 0,
        outboundClicks: clickCount,
        providerConfirmedConversions: 0,
        confirmedRevenueUSD: 0,
        zeroState: "No verified conversions yet",
        breakdowns: { sources: {}, campaigns: {} },
      },
      revenue,
      dailyRevenue: buildDailyRevenue(now, epnReport, amazonReport),
      notifications: [],
      epnClicks,
    },
  };
}
