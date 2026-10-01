import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const dashboard = read("../app/owner-dashboard/DashboardClient.jsx");
const panel = read("../app/owner-dashboard/ControlPanel.jsx");
const actionsRoute = read("../app/api/owner/actions-status/route.js");
const clicksRoute = read("../app/api/owner/live-clicks/route.js");
const blueDispatchRoute = read("../app/api/owner/blue-live-verify/route.js");

test("owner dashboard mounts one animated control room", () => {
  assert.match(dashboard, /import ControlPanel from "\.\/ControlPanel"/);
  assert.match(dashboard, /<ControlPanel activeCode=\{activeCode\} \/>/);
  assert.match(panel, /BlindBoxAI Live Control Room/);
  assert.match(panel, /@keyframes sweep/);
  assert.match(panel, /prefers-reduced-motion/);
  assert.match(panel, /POLL_MS = 10_000/);
});

test("control room shows truthful live eBay and Amazon click telemetry", () => {
  assert.match(panel, /eBay EPN clicks/);
  assert.match(panel, /Amazon clicks/);
  assert.match(panel, /\/api\/owner\/live-clicks/);
  assert.match(clicksRoute, /assertOwnerCode/);
  assert.match(clicksRoute, /lookbackDays: 1/);
  assert.match(clicksRoute, /recentLimit: 30/);
  assert.match(clicksRoute, /byProvider\.ebay_epn/);
  assert.match(clicksRoute, /byProvider\.ebay_epn_live/);
  assert.match(clicksRoute, /byProvider\.amazon_associates/);
  assert.match(panel, /provider === "ebay_epn" \|\| provider === "ebay_epn_live"/);
  assert.match(clicksRoute, /qualifiedHuman/);
  assert.match(clicksRoute, /qualifiedAffiliateClicks/);
  assert.doesNotMatch(clicksRoute, /clientClass|qualityReason/);
});

test("action feed is owner-only and reads server-side GitHub status", () => {
  assert.match(panel, /\/api\/owner\/actions-status/);
  assert.match(actionsRoute, /assertOwnerCode/);
  assert.match(actionsRoute, /GITHUB_OWNER_APPROVAL_TOKEN/);
  assert.doesNotMatch(actionsRoute, /NEXT_PUBLIC_/);
  assert.match(actionsRoute, /BlindBoxAI release gate/);
  assert.match(actionsRoute, /Build BlindBoxAI Live Wallpaper/);
  assert.match(actionsRoute, /Owner Blue live verify once/);
  assert.match(actionsRoute, /page <= 20/);
  assert.match(actionsRoute, /"waiting", "requested"/);
  assert.match(actionsRoute, /run\.name === "Owner Blue live verify once" && run\.event !== "workflow_dispatch"/);
});

test("Blue button dispatch is explicit owner action and never publishes", () => {
  assert.match(panel, /BLUE LIVE VERIFY/);
  assert.match(panel, /runBlueVerify/);
  assert.match(panel, /fetch\("\/api\/owner\/blue-live-verify"/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /loadInFlight\.current/);
  assert.match(panel, /blueDispatchPending/);
  assert.match(blueDispatchRoute, /assertOwnerCode/);
  assert.match(blueDispatchRoute, /VERCEL_ENV !== "production"/);
  assert.match(blueDispatchRoute, /VERCEL_GIT_COMMIT_REF !== "main"/);
  assert.match(blueDispatchRoute, /owner-blue-live-verify-once\.yml/);
  assert.match(blueDispatchRoute, /JSON\.stringify\(\{ ref: "main" \}\)/);
  assert.match(blueDispatchRoute, /OWNER_LOGIN = "ubiquitousservices888-rgb"/);
  assert.match(blueDispatchRoute, /tokenOwner\(token\)/);
  assert.match(blueDispatchRoute, /allowOverwrite: false/);
  assert.match(blueDispatchRoute, /blue-live-verify-lock/);
  assert.match(blueDispatchRoute, /await del\(lockPath\)/);
  const authGuard = blueDispatchRoute.indexOf("assertOwnerCode(ownerCode)");
  const productionGuard = blueDispatchRoute.indexOf('process.env.VERCEL_ENV !== "production"');
  const dispatchCall = blueDispatchRoute.indexOf("/dispatches");
  assert.ok(authGuard >= 0 && authGuard < dispatchCall, "owner auth must run before GitHub dispatch");
  assert.ok(productionGuard >= 0 && productionGuard < dispatchCall, "production/main gate must run before GitHub dispatch");
  assert.match(blueDispatchRoute, /published: false/);
  assert.doesNotMatch(blueDispatchRoute, /BUFFER_API_TOKEN|publish-approved-review|record_channel|action:\s*"claim"/);
});

test("GitHub owner routes share one security helper", () => {
  assert.match(actionsRoute, /github-owner\.mjs/);
  assert.match(blueDispatchRoute, /github-owner\.mjs/);
  assert.doesNotMatch(actionsRoute, /function githubHeaders|function unauthorized/);
  assert.doesNotMatch(blueDispatchRoute, /function githubHeaders|function unauthorized/);
});
