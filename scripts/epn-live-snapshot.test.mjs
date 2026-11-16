import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildEpnLiveSnapshot, epnLiveSnapshotIsFresh, redactStaleEpnSnapshot, selectEpnDashboardReport, EPN_LIVE_SNAPSHOT_PATH } from "../lib/epn-live-snapshot.mjs";
import { syncEpnLiveSnapshot } from "../lib/epn-live-sync.mjs";
import { getOwnerDashboardSnapshot } from "../lib/owner-dashboard.js";
import { epnCronAccessDecision } from "../lib/epn-cron-access.mjs";

const now = new Date("2026-11-03T16:00:00.000Z");
const startDate = "2026-09-29", endDate = "2026-11-03";
const h = "EventDate,UpdateDate,CustomId,Earnings,EpnTransactionId,Status,Currency,ItemId";
const approved = [
  h,
  "2026-10-20,2026-11-02,bb-rv-0123456789abcdef,1.25,tx-1,approved,USD,item-a",
  "2026-10-20,2026-11-02,bb-rv-0123456789abcdef,2.75,tx-1,approved,USD,item-b",
  "2026-10-22,2026-11-02,not-ours,95.00,tx-2,approved,USD,item-c",
].join("\n");
const create = (csv = approved) => buildEpnLiveSnapshot(csv, { now, startDate, endDate });

test("one transaction across two item rows counts once", () => {
  const report = create();
  assert.equal(report.orders, 1);
  assert.equal(report.earnings, 4);
  assert.equal(report.providerTransactionsParsed, 2);
  assert.equal(report.eligibleTransactions, 1);
  assert.equal(report.rollingWindowOnly, true);
  assert.equal(report.providerPayoutVerified, false);
  assert.equal(report.historicalLedgerReconciled, false);
  assert.equal(report.reconciliationRequired, false);
  assert.equal("evidence" in report, false);
  assert.doesNotMatch(JSON.stringify(report), /tx-1|tx-2|item-a|item-b/);
});
test("repeated rows or reports do not multiply earnings", () => {
  const csv = approved + "\n" + approved.split("\n")[1];
  assert.equal(create(csv).earnings, 4);
  assert.equal(create(csv).orders, 1);
});
test("reversal or pending conflict withholds financial totals", () => {
  for (const status of ["reversed", "pending"]) {
    const report = create([h,
      "2026-10-20,2026-11-02,bb-rv-0123456789abcdef,4,tx-1,approved,USD,item-a",
      `2026-10-20,2026-11-03,bb-rv-0123456789abcdef,-4,tx-1,${status},USD,item-a`,
    ].join("\n"));
    assert.equal(report.reconciliationRequired, true);
    assert.equal(report.earnings, null);
    assert.equal(report.orders, null);
    assert.deepEqual(report.daily, []);
  }
});
test("standalone reversal requires reconciliation", () => {
  const report = create([h,"2026-10-21,2026-11-03,bb-rv-0123456789abcdef,-5,tx-old,reversed,USD,item-z"].join("\n"));
  assert.equal(report.reconciliationRequired, true);
  assert.equal(report.earnings, null);
});
test("foreign transaction does not count toward BlindBoxAI", () => {
  const report = create([h,"2026-10-22,2026-11-02,not-ours,29,tx-foreign,approved,USD,item-c"].join("\n"));
  assert.equal(report.orders, 0);
  assert.equal(report.earnings, 0);
});
test("summary-only reports cannot make verified transactions", () => {
  assert.throws(() => create("Status,Earnings,Clicks\napproved,5,20"), /missing identities|transaction identities/);
});
test("stale authenticated report withholds all financial totals", () => {
  const report = create();
  assert.equal(epnLiveSnapshotIsFresh(report, new Date("2026-11-04T16:00:00Z")), true);
  const stale = redactStaleEpnSnapshot(report, new Date("2026-11-06T18:00:00Z"));
  assert.equal(stale.orders, null);
  assert.equal(stale.earnings, null);
  assert.deepEqual(stale.daily, []);
  assert.match(stale.status, /stale/);
});
test("two successful syncs overwrite one private path, never add revenue", async () => {
  const writes = [];
  const env = { EPN_ACCOUNT_SID:"exampleSid123", EPN_REPORTING_ACCESS_TOKEN:"synthetic-test-value", EPN_REPORTING_CURRENCY:"USD" };
  const run = async () => syncEpnLiveSnapshot({
    now, env,
    fetchImpl: async () => new Response(approved, { headers: { "content-type":"text/csv" } }),
    putImpl: async (path, data, options) => { writes.push({path,report:JSON.parse(data),options}); },
  });
  await run(); await run();
  assert.equal(writes.length, 2);
  assert.equal(writes[0].path, EPN_LIVE_SNAPSHOT_PATH);
  assert.equal(writes[1].path, EPN_LIVE_SNAPSHOT_PATH);
  assert.equal(writes[1].report.earnings, 4);
  assert.equal(writes[1].report.orders, 1);
  assert.equal(writes[1].options.access,"private");
  assert.equal(writes[1].options.allowOverwrite,true);
  assert.doesNotMatch(JSON.stringify(writes), /synthetic-test-value|tx-1/);
});
test("sync result returns accurate non-financial status without leaking provider identities", async () => {
  const writes = [];
  const result = await syncEpnLiveSnapshot({
    now,
    env: { EPN_ACCOUNT_SID:"exampleSid123", EPN_REPORTING_ACCESS_TOKEN:"synthetic-test-value", EPN_REPORTING_CURRENCY:"USD" },
    fetchImpl: async () => new Response(approved, { headers: { "content-type":"text/csv" } }),
    putImpl: async (path, data, options) => { writes.push({path, data:JSON.parse(data), options}); },
  });
  assert.deepEqual(result, {
    ok: true,
    persisted: true,
    retrievedAt: now.toISOString(),
    reportingWindowStart: "2026-09-29",
    reportingWindowEnd: "2026-11-03",
    providerTransactionsParsed: 2,
    eligibleTransactions: 1,
    reconciliationRequired: false,
    historicalLedgerReconciled: false,
    payoutVerified: false,
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, EPN_LIVE_SNAPSHOT_PATH);
  assert.doesNotMatch(JSON.stringify(result), /tx-1|tx-2|synthetic-test-value|exampleSid123/);
});
test("failed provider read cannot overwrite previous snapshot", async () => {
  let writes = 0;
  await assert.rejects(syncEpnLiveSnapshot({
    now,
    env: {EPN_ACCOUNT_SID:"exampleSid123", EPN_REPORTING_ACCESS_TOKEN:"synthetic-test-value", EPN_REPORTING_CURRENCY:"USD"},
    fetchImpl: async () => new Response("denied", {status:401,headers:{"content-type":"text/csv"}}),
    putImpl: async () => {writes++;},
  }));
  assert.equal(writes,0);
});
test("live reads never revive an older manual report after a failure", () => {
  const live = create();
  const manual = {source:"ebay_partner_network_csv", earnings:999, orders:77};
  const value = state => selectEpnDashboardReport({ liveState:state, manualReport:manual, now });
  assert.equal(value({kind:"missing"}), manual);
  assert.equal(value({kind:"present",report:live}).earnings, 4);
  assert.equal(value({kind:"failed"}).earnings, null);
  assert.equal(value({kind:"present",report:{source:"untrusted",earnings:999}}).earnings, null);
  assert.equal(value({kind:"present",report:{...live,reportType:"summary_only"}}).earnings, null);
  assert.equal(value({kind:"present",report:{...live,reconciliationRequired:true}}).earnings, null);
  const after = selectEpnDashboardReport({ liveState:{kind:"present",report:live}, manualReport:manual, now:new Date("2026-11-08T16:00:00Z") });
  assert.equal(after.earnings, null);
  assert.equal(after.orders, null);
});
test("missing transaction IDs or partially malformed financial rows fail closed", () => {
  const missing = [h,"2026-11-02,2026-11-02,bb-rv-0123456789abcdef,1.5,,approved,USD,item-a"].join("\n");
  assert.throws(() => create(missing), /missing identities/);
  const partiallyMalformed = [h,
    "2026-11-02,2026-11-02,bb-rv-0123456789abcdef,1.5,tx-a,approved,USD,item-a",
    "2026-11-03,2026-11-03,bb-rv-0123456789abcdef,INVALID,tx-b,approved,USD,item-b",
  ].join("\n");
  assert.throws(() => create(partiallyMalformed), /malformed financial rows/);
});
test("owner dashboard behavior: live, stale, blocked, unreadable, and missing blobs", async () => {
  const live = create();
  const manual = { verificationVersion: 1, source: "ebay_partner_network_csv", status: "Connected from EPN report", earnings: 999, orders: 77, daily: [] };
  const revenueFor = async (liveState, at = now) => {
    // The production dashboard uses current time. Give the synthetic live
    // report a matching timestamp to exercise current and stale age behavior.
    const state = liveState?.kind === "present"
      ? { ...liveState, report: { ...liveState.report, importedAt: new Date(Date.now()).toISOString() } }
      : liveState;
    const response = await getOwnerDashboardSnapshot({
      ownerCode: "synthetic-owner",
      readLiveState: async () => state,
      readReport: async path => path.includes("/epn-report/") ? manual : null,
      readTelemetry: async () => ({ recentClicks:[], clicksLoaded:0, clicksLast24h:0, analyticsLoaded:0, analyticsLast24h:0 }),
    });
    return response.snapshot.revenue.epn;
  };
  const fresh = await revenueFor({kind:"present",report:live});
  assert.equal(fresh.earnings,4);
  assert.equal((await revenueFor({kind:"missing"})).earnings,999);
  assert.equal((await revenueFor({kind:"failed"})).earnings,null);
  assert.equal((await revenueFor({kind:"present",report:{...live,reconciliationRequired:true}})).earnings,null);
  assert.equal((await revenueFor({kind:"present",report:{...live,source:"tampered"}})).earnings,null);
  const expired = { ...live, importedAt: "2026-01-01T00:00:00.000Z" };
  const staleResponse = await getOwnerDashboardSnapshot({
    ownerCode: "synthetic-owner",
    readLiveState: async () => ({kind:"present",report:expired}),
    readReport: async path => path.includes("/epn-report/") ? manual : null,
    readTelemetry: async () => ({recentClicks:[],clicksLoaded:0,clicksLast24h:0,analyticsLoaded:0,analyticsLast24h:0}),
  });
  assert.equal(staleResponse.snapshot.revenue.epn.earnings,null);
});

test("cron authorization decision enforces secret, Unicode safety and default-off", () => {
  const secret = "synthetic_cron_secret_example_12345678";
  const valid = "Bearer " + secret;
  assert.equal(epnCronAccessDecision({authorization:"",secret,enabled:"true"}),"unauthorized");
  assert.equal(epnCronAccessDecision({authorization:"Bearer wrong",secret,enabled:"true"}),"unauthorized");
  assert.equal(epnCronAccessDecision({authorization:"Bearer " + "ñ".repeat(secret.length),secret,enabled:"true"}),"unauthorized");
  assert.equal(epnCronAccessDecision({authorization:valid,secret,enabled:"false"}),"disabled");
  assert.equal(epnCronAccessDecision({authorization:valid,secret,enabled:"true"}),"allowed");
  assert.equal(epnCronAccessDecision({authorization:valid,secret:"",enabled:"true"}),"unauthorized");
});
test("cron must have secret, explicit enable flag, and no immutable-ledger write", () => {
  const cron = readFileSync(new URL("../app/api/cron/epn-sync/route.js",import.meta.url),"utf8");
  const owner = readFileSync(new URL("../app/owner-dashboard/RevenueSummaryClient.jsx",import.meta.url),"utf8");
  const dashboard = readFileSync(new URL("../lib/owner-dashboard.js",import.meta.url),"utf8");
  assert.match(cron,/CRON_SECRET/);
  assert.match(cron,/epnCronAccessDecision/);
  assert.match(cron,/EPN_AUTO_SYNC_ENABLED/);
  const access = readFileSync(new URL("../lib/epn-cron-access.mjs",import.meta.url),"utf8");
  assert.match(access,/timingSafeEqual/);
  assert.match(owner,/Verify live eBay report \(read-only\)/);
  assert.match(owner,/api\/owner\/epn-tdr/);
  assert.match(dashboard,/selectEpnDashboardReport/);
  assert.doesNotMatch(cron,/recordProviderEvidence|provider_conversion_evidence/);
});
