import { put } from "@vercel/blob";
import { epnTdrDateRange, fetchEpnTdrCsv } from "./epn-tdr-api.mjs";
import { buildEpnLiveSnapshot, EPN_LIVE_SNAPSHOT_PATH } from "./epn-live-snapshot.mjs";

// A single daily replacement, never an additive financial ledger import.
// The cron is intentionally disabled until real provider access is confirmed.
export async function syncEpnLiveSnapshot({
  now = new Date(),
  fetchImpl = fetch,
  putImpl = put,
  env = process.env,
} = {}) {
  if (env.EPN_REPORTING_CURRENCY !== "USD" ||
      !env.EPN_ACCOUNT_SID || !env.EPN_REPORTING_ACCESS_TOKEN) {
    throw new Error("EPN reporting configuration is incomplete");
  }
  const { startDate, endDate } = epnTdrDateRange(now, 35);
  const csv = await fetchEpnTdrCsv({
    accountSid: env.EPN_ACCOUNT_SID,
    authToken: env.EPN_REPORTING_ACCESS_TOKEN,
    startDate, endDate, fetchImpl,
  });
  const snapshot = buildEpnLiveSnapshot(csv, { now, startDate, endDate });
  // Write only after a full, successful provider read and local validation.
  // A flagged snapshot withdraws previously visible earnings until review.
  await putImpl(EPN_LIVE_SNAPSHOT_PATH, JSON.stringify(snapshot), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  // No raw CSV, token, transaction identifier, or amount in cron responses.
  return {
    ok: true,
    persisted: true,
    retrievedAt: snapshot.importedAt,
    reportingWindowStart: startDate,
    reportingWindowEnd: endDate,
    providerTransactionsParsed: snapshot.providerTransactionsParsed,
    eligibleTransactions: snapshot.eligibleTransactions,
    reconciliationRequired: snapshot.reconciliationRequired,
    historicalLedgerReconciled: false,
    payoutVerified: false,
  };
}
