import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createAuditor } from "./audit.mjs";

const auditor = createAuditor();
after(() => auditor.close());
const audit = (events) => auditor.audit(events, { kind: "fixture" });
const conversion = (extra = {}) => ({ namespace: "production", test: false, event: "provider_conversion",
  provider: "ebay_epn", providerEvidenceId: "fixture-1", customId: "bb-rv-fixture",
  status: "provider_confirmed", confirmedRevenueUSD: "4.50", ...extra });

test("clicks, pending records and test observations cannot become consistent amounts", () => {
  const r = audit([
    conversion({ event: "outbound_affiliate_click" }),
    conversion({ test: true, confirmedRevenueUSD: "9999" }),
    conversion({ namespace: "demo" }),
    conversion({ status: "pending" }),
  ]);
  assert.equal(r.nonConversionRows, 1);
  assert.equal(r.excludedNonProductionRows, 2);
  assert.equal(r.analysis.consistentIdentities, 0);
  assert.equal(r.analysis.quarantinedIdentities, 1);
  assert.equal(r.analysis.consistentReportedAmountCents, "0");
  assert.equal(r.financialTruth.cashReceivedUSD, null);
});

test("identical observations deduplicate while cents stay exact", () => {
  const a = conversion({ confirmedRevenueUSD: "0.10" });
  const r = audit([a, a, conversion({ providerEvidenceId: "fixture-2", confirmedRevenueUSD: "0.20" })]);
  assert.equal(r.analysis.consistentIdentities, 2);
  assert.equal(r.analysis.duplicateObservations, 1);
  assert.equal(r.analysis.consistentReportedAmountCents, "30");
});

test("contradictory amounts quarantine the whole identity in either input order", () => {
  const a = conversion();
  const b = conversion({ confirmedRevenueUSD: "45.00" });
  for (const events of [[a, b], [b, a]]) {
    const r = audit(events).analysis;
    assert.equal(r.consistentIdentities, 0);
    assert.equal(r.quarantinedIdentities, 1);
    assert.equal(r.consistentReportedAmountCents, "0");
    assert.deepEqual(r.quarantines[0].reasons, ["conflicting_amount"]);
  }
});

test("later rejection or attribution conflict cannot leave a profitable row counted", () => {
  for (const later of [conversion({ status: "rejected" }), conversion({ customId: "bb-rv-other" }),
    conversion({ customId: { malformed: true } })]) {
    const r = audit([conversion(), later]).analysis;
    assert.equal(r.quarantinedIdentities, 1);
    assert.equal(r.consistentReportedAmountCents, "0");
  }
});

test("equivalent reconciled evidence and numeric encodings can agree", () => {
  const r = audit([conversion(), conversion({ status: "reconciled", confirmedRevenueUSD: 4.5 })]);
  assert.equal(r.analysis.consistentIdentities, 1);
  assert.equal(r.analysis.consistentReportedAmountCents, "450");
});

test("malformed, negative, foreign-currency and overprecision amounts fail closed", () => {
  for (const extra of [{ confirmedRevenueUSD: "1.234" }, { confirmedRevenueUSD: "-1" },
    { confirmedRevenueUSD: null }, { confirmedRevenueUSD: "0x10" }, { currency: "EUR" },
    { confirmedRevenueUSD: "90071992547410" }]) {
    const r = audit([conversion(), conversion(extra)]).analysis;
    assert.equal(r.quarantinedIdentities, 1);
    assert.equal(r.consistentReportedAmountCents, "0");
  }
});

test("overflow is explicit and totals never wrap", () => {
  const r = audit([conversion({ confirmedRevenueUSD: "90071992547409" }),
    conversion({ providerEvidenceId: "fixture-2", confirmedRevenueUSD: "1" })]).analysis;
  assert.equal(r.totalOverflow, true);
  assert.equal(r.consistentReportedAmountCents, null);
});

test("tuple keys resist separators and output omits raw identity values", () => {
  const r = audit([conversion({ provider: "a:b", providerEvidenceId: "c\tprivate", customId: "" }),
    conversion({ provider: "a", providerEvidenceId: "b:c", customId: "" })]);
  assert.equal(r.analysis.consistentIdentities, 2);
  assert.equal(r.analysis.unattributedConsistentIdentities, 2);
  assert.ok(!JSON.stringify(r).includes("private"));
});

test("explicit scope and valid input are required", () => {
  assert.throws(() => auditor.audit([]), /explicit_evidence_kind_required/);
  assert.throws(() => audit({ rows: [] }), /invalid_input_shape/);
  assert.throws(() => audit(Array(10001).fill(null)), /invalid_input_shape/);
  const r = audit([conversion({ providerEvidenceId: "  " }), null]);
  assert.equal(r.invalidRows, 2);
  assert.equal(r.analysis.conversionIdentities, 0);
});

test("saved provider IDs and URL candidates never prove live publication", () => {
  const row = { research_run_id: "rv-fixture", buffer_post_ids: { youtube: "post-fixture" } };
  const r = auditor.audit({ schema: "blindboxai.stuck-review-receipts/v1", rows: [row, row] }, { kind: "export" });
  assert.equal(r.evidenceStatus, "UNVERIFIED_EXPORT");
  assert.equal(r.analysis.receiptIdentities, 1);
  assert.equal(r.analysis.storedProviderPostIds, 1);
  assert.equal(r.analysis.storedPublicUrlCandidates, 0);
  assert.equal(r.analysis.receiptsNeedingReconciliation, 1);
  assert.equal(r.financialTruth.livePublicationVerified, false);
  const candidate = auditor.audit({ schema: "blindboxai.stuck-review-receipts/v1",
    rows: [{ ...row, public_urls: { youtube: "https://example.invalid/unverified" } }] }, { kind: "fixture" });
  assert.equal(candidate.analysis.storedPublicUrlCandidates, 1);
  assert.equal(candidate.financialTruth.livePublicationVerified, false);
});

test("conflicting receipt identities require reconciliation", () => {
  const row = { research_run_id: "rv-fixture", buffer_post_ids: { youtube: "one" } };
  const r = auditor.audit({ schema: "blindboxai.stuck-review-receipts/v1",
    rows: [row, { ...row, buffer_post_ids: { youtube: "two" } }] }, { kind: "fixture" });
  assert.equal(r.analysis.conflictingReceiptIdentities, 1);
  assert.equal(r.analysis.receiptsNeedingReconciliation, 1);
});

test("historical repository snapshot retains five unresolved provider receipts", () => {
  const input = JSON.parse(fs.readFileSync(new URL("../../data/stuck-review-video-receipts-20261115.json", import.meta.url)));
  const r = auditor.audit(input, { kind: "export" });
  assert.equal(r.analysis.receiptIdentities, input.rows.length);
  assert.equal(r.analysis.receiptsNeedingReconciliation, 5);
  assert.equal(r.analysis.storedPublicUrlCandidates, 0);
  assert.equal(r.financialTruth.providerAuthenticationVerified, false);
});

test("CLI bounds input, suppresses malformed data and includes the exact file digest", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "blindbox-audit-cli-test-"));
  const cli = fileURLToPath(new URL("./audit.mjs", import.meta.url));
  const input = path.join(temporary, "input.json");
  try {
    fs.writeFileSync(input, "{secret-contents-invalid-json");
    const invalid = spawnSync(process.execPath, [cli, "--input", input, "--kind", "export"], { encoding: "utf8" });
    assert.equal(invalid.status, 2);
    assert.ok(!invalid.stderr.includes("secret-contents"));
    fs.writeFileSync(input, "[]");
    const result = spawnSync(process.execPath, [cli, "--input", input, "--kind", "fixture"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const r = JSON.parse(result.stdout);
    assert.equal(r.inputSha256, "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
    assert.equal(r.evidenceStatus, "FIXTURE_ONLY");
    fs.truncateSync(input, 5 * 1024 * 1024 + 1);
    const large = spawnSync(process.execPath, [cli, "--input", input, "--kind", "export"], { encoding: "utf8" });
    assert.equal(large.status, 2);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
