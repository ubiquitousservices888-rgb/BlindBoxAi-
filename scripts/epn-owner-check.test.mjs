import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("owner can launch EPN check without waiting for Supabase dashboard", () => {
  const client = read("app/owner-dashboard/epn-check/EpnLiveCheck.jsx");
  const page = read("app/owner-dashboard/epn-check/page.jsx");
  const home = read("app/owner-dashboard/page.jsx");
  const revenue = read("app/owner-dashboard/revenue/page.jsx");
  assert.match(page, /EpnLiveCheck/);
  assert.doesNotMatch(page, /RevenueSummaryClient|DashboardClient/);
  assert.match(home, /\/owner-dashboard\/epn-check/);
  assert.match(revenue, /\/owner-dashboard\/epn-check/);
  assert.match(client, /\/api\/owner\/epn-tdr/);
  assert.doesNotMatch(client, /\/api\/owner\/dashboard|localStorage|sessionStorage|document\.cookie/);
});

test("provider verification uses private owner Bearer header, never URL or browser storage", () => {
  const client = read("app/owner-dashboard/epn-check/EpnLiveCheck.jsx");
  assert.match(client, /type="password"/);
  assert.match(client, /Authorization: `Bearer \$\{code\}`/);
  assert.match(client, /cache: "no-store"/);
  assert.match(client, /redirect: "error"/);
  assert.match(client, /persisted !== false/);
  assert.match(client, /verifiedProviderPayout !== false/);
  assert.match(client, /reportType !== "transaction_detail"/);
  assert.doesNotMatch(client, /fetch\("\/api\/owner\/epn-report"/);
  assert.doesNotMatch(client, /sendBeacon|createElement\("script"|window\.location/);
});

test("owner-facing errors distinguish auth, missing config, provider and network failures", () => {
  const client = read("app/owner-dashboard/epn-check/EpnLiveCheck.jsx");
  assert.match(client, /response\.status === 401/);
  assert.match(client, /response\.status === 503/);
  assert.match(client, /response\.status === 502/);
  assert.match(client, /Owner code rejected/);
  assert.match(client, /eBay reporting configuration is incomplete/);
  assert.match(client, /live eBay report could not be verified/);
  assert.match(client, /could not reach the server/);
  assert.match(client, /report\.reconciliationRequired/);
  assert.match(client, /Withheld pending historical reconciliation/);
});
