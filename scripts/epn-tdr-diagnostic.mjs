import { inspectEpnTdr } from "../lib/epn-tdr-api.mjs";

// This diagnostic runs in a public GitHub repository. Never print private
// EPN transactions, commission values, URLs, Account SID or Auth Token.
try {
  if (process.env.EPN_REPORTING_CURRENCY !== "USD") {
    throw new Error("EPN reporting currency must be explicitly verified as USD");
  }
  const summary = await inspectEpnTdr({
    accountSid: process.env.EPN_ACCOUNT_SID,
    authToken: process.env.EPN_REPORTING_ACCESS_TOKEN,
  });
  if (summary.reportType !== "transaction_detail" || summary.persisted !== false) {
    throw new Error("TDR inspection did not pass read-only checks");
  }
  console.log("EPN_TDR_AUTH_READ: PASS");
  console.log("EPN_TDR_REPORT_TYPE: transaction_detail");
  console.log("EPN_TDR_EVIDENCE_PERSISTED: false");
  console.log("EPN_TDR_PRIVATE_FINANCIAL_VALUES_LOGGED: false");
} catch {
  console.error("EPN_TDR_AUTH_READ: FAILED_OR_UNCONFIGURED; no report imported");
  process.exitCode = 1;
}
