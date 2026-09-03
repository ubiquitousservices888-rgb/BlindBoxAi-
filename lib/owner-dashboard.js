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

async function readJsonBlob(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  try {
    return await new Response(result.stream).json();
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

function reportingStatus() {
  return {
    epn: {
      status: "Reporting not connected",
      orders: null,
      earnings: null,
      epc: null,
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
  const [clickBlobs, notificationBlobs] = await Promise.all([
    listRecentBlobMetadata({ listPage: list, prefix: "affiliate/clicks/", now }),
    listRecentBlobMetadata({ listPage: list, prefix: "owner/notifications/", now }),
  ]);

  const visibleClickBlobs = newestBlobs(clickBlobs, CLICK_DISPLAY_LIMIT);
  const visibleNotificationBlobs = newestBlobs(notificationBlobs, NOTIFICATION_DISPLAY_LIMIT);
  const clickLast24h = countBlobsInWindow(clickBlobs, {
    from: new Date(now.getTime() - DAY_MS),
    through: now,
  });

  const etag = buildDashboardEtag({
    clickCount: clickBlobs.length,
    clickLast24h,
    notificationCount: notificationBlobs.length,
    visibleClickBlobs,
    visibleNotificationBlobs,
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
      revenue: reportingStatus(),
      notifications,
      epnClicks,
    },
  };
}
