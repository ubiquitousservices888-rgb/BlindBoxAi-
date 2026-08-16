import { createHash } from "node:crypto";

export const DASHBOARD_LOOKBACK_DAYS = 2;
export const CLICK_DISPLAY_LIMIT = 24;
export const NOTIFICATION_DISPLAY_LIMIT = 12;
export const LIST_PAGE_SIZE = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function recentUtcDateStrings(now = new Date(), count = DASHBOARD_LOOKBACK_DAYS) {
  const time = new Date(now).getTime();
  if (!Number.isFinite(time)) throw new Error("Invalid dashboard clock.");
  if (!Number.isInteger(count) || count < 1) throw new Error("Dashboard lookback must be a positive integer.");

  const current = new Date(time);
  const midnight = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
  );

  return Array.from({ length: count }, (_, index) =>
    new Date(midnight - index * DAY_MS).toISOString().slice(0, 10),
  );
}

export async function listAllBlobPages(listPage, { prefix, limit = LIST_PAGE_SIZE }) {
  if (typeof listPage !== "function") throw new Error("A Blob list function is required.");

  const blobs = [];
  const seenCursors = new Set();
  let cursor;

  while (true) {
    const page = await listPage({
      prefix,
      limit,
      ...(cursor ? { cursor } : {}),
    });

    if (!page || !Array.isArray(page.blobs)) {
      throw new Error(`Invalid Blob list response for ${prefix}.`);
    }
    blobs.push(...page.blobs);

    if (!page.hasMore) return blobs;
    if (!page.cursor || seenCursors.has(page.cursor)) {
      throw new Error(`Blob pagination did not advance for ${prefix}.`);
    }

    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }
}

export async function listRecentBlobMetadata({
  listPage,
  prefix,
  now = new Date(),
  days = DASHBOARD_LOOKBACK_DAYS,
  pageSize = LIST_PAGE_SIZE,
}) {
  const dates = recentUtcDateStrings(now, days);
  const pages = await Promise.all(
    dates.map((date) =>
      listAllBlobPages(listPage, {
        prefix: `${prefix}${date}/`,
        limit: pageSize,
      }),
    ),
  );

  const unique = new Map();
  for (const blob of pages.flat()) {
    if (blob?.pathname) unique.set(blob.pathname, blob);
  }
  return [...unique.values()];
}

export function newestBlobs(blobs, limit) {
  if (!Number.isInteger(limit) || limit < 0) throw new Error("Blob display limit must be a non-negative integer.");

  return [...blobs]
    .sort((left, right) => {
      const byTime = dateValue(right.uploadedAt) - dateValue(left.uploadedAt);
      if (byTime) return byTime;
      return String(right.pathname || "").localeCompare(String(left.pathname || ""));
    })
    .slice(0, limit);
}

export function countBlobsInWindow(blobs, { from, through }) {
  const fromTime = new Date(from).getTime();
  const throughTime = new Date(through).getTime();
  if (!Number.isFinite(fromTime) || !Number.isFinite(throughTime)) {
    throw new Error("Invalid Blob count window.");
  }

  return blobs.filter((blob) => {
    const uploadedAt = dateValue(blob.uploadedAt);
    return uploadedAt >= fromTime && uploadedAt <= throughTime;
  }).length;
}

function blobIdentity(blob) {
  return [
    String(blob.pathname || ""),
    String(blob.etag || ""),
    Number(blob.size || 0),
    dateValue(blob.uploadedAt),
  ];
}

export function buildDashboardEtag({
  clickCount,
  clickLast24h,
  notificationCount,
  visibleClickBlobs,
  visibleNotificationBlobs,
}) {
  const payload = JSON.stringify({
    clickCount,
    clickLast24h,
    notificationCount,
    visibleClickBlobs: visibleClickBlobs.map(blobIdentity),
    visibleNotificationBlobs: visibleNotificationBlobs.map(blobIdentity),
  });
  const digest = createHash("sha256").update(payload).digest("base64url");
  return `"${digest}"`;
}

export function requestEtagMatches(headerValue, etag) {
  const expected = String(etag).replace(/^W\//, "");
  return String(headerValue || "")
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value.replace(/^W\//, "") === expected);
}
