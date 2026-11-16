#!/usr/bin/env node
// Owner-controlled READ-ONLY diagnostic. Never re-dispatch, republish or backfill.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { reconcilePublicVideoUrls } from "./reconcile-public-video-urls.mjs";
import { summarizeStuckVideoReceipts, validateStuckVideoSnapshot } from "../lib/stuck-video-receipt-recovery.mjs";

export async function runStuckVideoReceiptDiagnostic({
  snapshot,
  token,
  organizationId,
  reconcile = reconcilePublicVideoUrls,
} = {}) {
  const rows = validateStuckVideoSnapshot(snapshot); // Validate before any provider request.
  const receipts = await reconcile({ inventory: rows, token, organizationId });
  return summarizeStuckVideoReceipts(rows, receipts);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const snapshot = JSON.parse(readFileSync(new URL("../data/stuck-review-video-receipts-20261115.json", import.meta.url), "utf8"));
    const report = await runStuckVideoReceiptDiagnostic({
      snapshot,
      token: process.env.BUFFER_API_TOKEN,
      organizationId: process.env.BUFFER_ORGANIZATION_ID,
    });
    console.log("STUCK_REVIEW_RECEIPTS: " + JSON.stringify(report));
    console.log("STUCK_REVIEW_SUMMARY: " + report.reviewable + "/" + report.reviewed +
      " public proofs ready for separate owner review; " + report.unresolved + " remain unverified; zero writes; zero posts");
    if (report.unresolved) process.exitCode = 2;
  } catch {
    console.error("STUCK_REVIEW_RECEIPTS: FAIL_CLOSED — invalid snapshot, credentials unavailable, or provider read failed; no posts or database writes");
    process.exitCode = 1;
  }
}
