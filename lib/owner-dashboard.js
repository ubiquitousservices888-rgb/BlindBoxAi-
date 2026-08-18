import { get, list } from "@vercel/blob";

import { aggregateFunnel } from "./funnel-events.mjs";
import {
  buildDashboardEtag,
  CLICK_DISPLAY_LIMIT,
  countBlobsInWindow,
  FUNNEL_DISPLAY_LIMIT,
  listAllBlobPages,
  listRecentBlobMetadata,
  newestBlobs,
  normalizeLookbackDays,
  NOTIFICATION_DISPLAY_LIMIT,
  recentUtcDateStrings,
  requestEtagMatches,
} from "./owner-dashboard-core.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

async function readJsonBlob(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  try { return await new Response(result.stream).json(); }
  catch { return null; }
}

async function readSelectedEvents(blobs) {
  const events = await Promise.all(blobs.map(async (blob) => {
    const event = await readJsonBlob(blob.pathname);
    return event ? { ...event, pathname: blob.pathname } : null;
  }));
  return events.filter(Boolean);
}

function eventIdFromPath(pathname) {
  return String(pathname || "").split("/").pop()?.replace(/\.json$/, "") || "";
}

function legacyClickToFunnel(event) {
  return {
    ...event,
    namespace: "production",
    test: false,
    status: "observed",
    event: "outbound_affiliate_click",
    occurredAt: event.clickedAt,
  };
}

export async function getOwnerDashboardSnapshot({ ifNoneMatch = "", lookbackDays } = {}) {
  const now = new Date();
  const days = normalizeLookbackDays(lookbackDays);
  const [clickBlobs, notificationBlobs, funnelBlobs, evidenceBlobs] = await Promise.all([
    listRecentBlobMetadata({ listPage: list, prefix: "affiliate/clicks/", now, days }),
    listRecentBlobMetadata({ listPage: list, prefix: "owner/notifications/", now, days }),
    listRecentBlobMetadata({ listPage: list, prefix: "funnel/events/", now, days }),
    listAllBlobPages(list, { prefix: "funnel/evidence/ebay_epn/" }),
  ]);

  const visibleClickBlobs = newestBlobs(clickBlobs, CLICK_DISPLAY_LIMIT);
  const visibleNotificationBlobs = newestBlobs(notificationBlobs, NOTIFICATION_DISPLAY_LIMIT);
  const visibleFunnelBlobs = newestBlobs(funnelBlobs, FUNNEL_DISPLAY_LIMIT);
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
    funnelBlobs,
    evidenceBlobs,
    lookbackDays: days,
  });

  if (requestEtagMatches(ifNoneMatch, etag)) return { etag, notModified: true, snapshot: null };

  const [epnClicks, notifications, funnelEvents, providerEvidence] = await Promise.all([
    readSelectedEvents(visibleClickBlobs),
    readSelectedEvents(visibleNotificationBlobs),
    readSelectedEvents(funnelBlobs),
    readSelectedEvents(evidenceBlobs),
  ]);

  const includedDates = new Set(recentUtcDateStrings(now, days));
  const selectedEvidence = providerEvidence.filter((event) => {
    const timestamp = String(event.occurredAt || "");
    return includedDates.has(timestamp.slice(0, 10));
  });

  const funnelIds = new Set(funnelBlobs.map((blob) => eventIdFromPath(blob.pathname)));
  const legacyOnlyClicks = epnClicks
    .filter((event) => !funnelIds.has(eventIdFromPath(event.pathname)))
    .map(legacyClickToFunnel);
  const allFunnelEvents = [...funnelEvents, ...legacyOnlyClicks, ...selectedEvidence];
  const funnel = aggregateFunnel(allFunnelEvents);

  return {
    etag,
    notModified: false,
    snapshot: {
      generatedAt: now.toISOString(),
      window: { lookbackDays: days, utcDateBuckets: [...includedDates] },
      truthPolicy: {
        productionOnly: true,
        testDataExcluded: true,
        clickIsConversion: false,
        revenueRequiresProviderEvidence: true,
        providerEvidenceImmutable: true,
      },
      totals: {
        epnClicksLoaded: clickBlobs.length,
        epnClicksLast24h: clickLast24h,
        notificationsLoaded: notificationBlobs.length,
        providerEvidenceLoaded: selectedEvidence.length,
      },
      funnel,
      recentFunnelEvents: await readSelectedEvents(visibleFunnelBlobs),
      notifications,
      epnClicks,
    },
  };
}
