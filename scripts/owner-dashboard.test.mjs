import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDashboardEtag,
  countBlobsInWindow,
  listAllBlobPages,
  listRecentBlobMetadata,
  newestBlobs,
  recentUtcDateStrings,
  requestEtagMatches,
} from "../lib/owner-dashboard-core.mjs";

const uploadRoute = readFileSync(
  new URL("../app/api/media/upload/route.js", import.meta.url),
  "utf8",
);
const dashboardClient = readFileSync(
  new URL("../app/owner-dashboard/DashboardClient.jsx", import.meta.url),
  "utf8",
);
const dashboardRoute = readFileSync(
  new URL("../app/api/owner/dashboard/route.js", import.meta.url),
  "utf8",
);
const dashboardLib = readFileSync(
  new URL("../lib/owner-dashboard.js", import.meta.url),
  "utf8",
);

function blob(pathname, uploadedAt, etag = pathname) {
  return { pathname, uploadedAt: new Date(uploadedAt), etag, size: 1 };
}

test("legacy Blob date helper handles month boundaries", () => {
  assert.deepEqual(
    recentUtcDateStrings(new Date("2026-09-01T00:01:00.000Z"), 2),
    ["2026-09-01", "2026-08-31"],
  );
});

test("legacy Blob pagination helper follows every cursor", async () => {
  const calls = [];
  const pages = new Map([
    ["affiliate/clicks/2026-08-15/|", {
      blobs: [blob("affiliate/clicks/2026-08-15/old.json", "2026-08-15T01:00:00Z")],
      hasMore: true,
      cursor: "today-page-2",
    }],
    ["affiliate/clicks/2026-08-15/|today-page-2", {
      blobs: [blob("affiliate/clicks/2026-08-15/new.json", "2026-08-15T11:59:00Z")],
      hasMore: false,
    }],
    ["affiliate/clicks/2026-08-14/|", {
      blobs: [blob("affiliate/clicks/2026-08-14/yesterday.json", "2026-08-14T23:00:00Z")],
      hasMore: false,
    }],
  ]);

  async function listPage({ prefix, cursor }) {
    calls.push(`${prefix}|${cursor || ""}`);
    return pages.get(`${prefix}|${cursor || ""}`);
  }

  const metadata = await listRecentBlobMetadata({
    listPage,
    prefix: "affiliate/clicks/",
    now: new Date("2026-08-15T12:00:00Z"),
    days: 2,
    pageSize: 1,
  });

  assert.equal(metadata.length, 3);
  assert.equal(newestBlobs(metadata, 1)[0].pathname, "affiliate/clicks/2026-08-15/new.json");
  assert.ok(calls.includes("affiliate/clicks/2026-08-15/|today-page-2"));
});

test("legacy Blob pagination helper fails closed if a cursor does not advance", async () => {
  await assert.rejects(
    listAllBlobPages(
      async () => ({ blobs: [], hasMore: true, cursor: "stuck" }),
      { prefix: "owner/notifications/2026-08-15/", limit: 1 },
    ),
    /did not advance/,
  );
});

test("legacy last-24-hour Blob helper counts metadata correctly", () => {
  const blobs = [
    blob("a", "2026-08-15T11:00:00Z"),
    blob("b", "2026-08-14T11:59:59Z"),
    blob("c", "2026-08-14T12:00:00Z"),
  ];
  assert.equal(
    countBlobsInWindow(blobs, {
      from: new Date("2026-08-14T12:00:00Z"),
      through: new Date("2026-08-15T12:00:00Z"),
    }),
    2,
  );
});

test("dashboard ETags are stable and accept weak conditional requests", () => {
  const visibleClickBlobs = [blob("click", "2026-08-15T11:00:00Z", "click-v1")];
  const etag = buildDashboardEtag({
    clickCount: 1,
    clickLast24h: 1,
    notificationCount: 0,
    visibleClickBlobs,
    visibleNotificationBlobs: [],
  });
  const same = buildDashboardEtag({
    clickCount: 1,
    clickLast24h: 1,
    notificationCount: 0,
    visibleClickBlobs,
    visibleNotificationBlobs: [],
  });
  assert.equal(etag, same);
  assert.equal(requestEtagMatches(`W/${etag}`, etag), true);
  assert.notEqual(
    etag,
    buildDashboardEtag({
      clickCount: 2,
      clickLast24h: 1,
      notificationCount: 0,
      visibleClickBlobs,
      visibleNotificationBlobs: [],
    }),
  );
});

test("notification write failures are rethrown for callback retry", () => {
  assert.match(uploadRoute, /owner_upload_notification_failed[\s\S]*throw cause;/);
  assert.match(uploadRoute, /createHash\("sha256"\)\.update\(blob\.pathname\)/);
  assert.match(uploadRoute, /allowOverwrite:\s*true/);
});

test("dashboard polling starts only after authenticated data loads", () => {
  assert.match(dashboardClient, /const loaded = await load\(token, false\);[\s\S]*if \(loaded\) setActiveCode\(token\);/);
  assert.match(dashboardClient, /if \(!activeCode \|\| !snapshotRef\.current\) return undefined;/);
  assert.match(dashboardClient, /If-None-Match/);
});

test("dashboard uses Supabase telemetry without Blob list calls", () => {
  assert.match(dashboardLib, /getDistributionTelemetry/);
  assert.doesNotMatch(dashboardLib, /\bfrom\s+["']@vercel\/blob["'][\s\S]*\blist\b/);
  assert.doesNotMatch(dashboardLib, /listRecentBlobMetadata/);
  assert.match(dashboardRoute, /dashboardRefreshInFlight/);
  assert.match(dashboardRoute, /getOwnerDashboardSnapshot\(\{ ifNoneMatch: "", ownerCode \}\)/);
  assert.match(dashboardRoute, /if \(forceRefresh \|\| cacheExpired\)/);
});


test("owner dashboard renders verified funnel outcomes separately from clicks", () => {
  assert.match(dashboardClient, /Verified funnel/);
  assert.match(dashboardClient, /Confirmed conversions/);
  assert.match(dashboardClient, /Confirmed revenue/);
  assert.match(dashboardLib, /funnel:\s*telemetry\?\.funnel/);
});
