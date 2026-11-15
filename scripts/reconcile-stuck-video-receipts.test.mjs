import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStuckVideoSnapshot, summarizeStuckVideoReceipts } from "../lib/stuck-video-receipt-recovery.mjs";
import { runStuckVideoReceiptDiagnostic } from "./reconcile-stuck-video-receipts.mjs";

const row = {
  research_run_id: "rv-0123456789abcdef",
  status: "publishing",
  video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/test.mp4",
  buffer_post_ids: { youtube: "aaaaaaaaaaaaaaaaaaaaaaaa" },
  size_bytes: 12345,
  publishing_at: "2026-11-09T17:46:05Z",
};
const snapshot = (rows = [row]) => ({ schema: "blindboxai.stuck-review-receipts/v1", rows });
const receipt = (change = {}) => ({
  researchRunId: row.research_run_id, postId: row.buffer_post_ids.youtube, channel: "youtube",
  status: "VERIFIED", providerIdentityVerified: true, attributionVerified: true,
  sourceProof: { matched: true, method: "EXACT_URL" },
  publicUrl: "https://www.youtube.com/watch?v=AbCdEf12345",
  checkedAt: "2026-11-15T20:00:00Z", ...change,
});

test("actual read-only snapshot pins exactly five unique saved YouTube IDs", () => {
  const actual = JSON.parse(readFileSync(new URL("../data/stuck-review-video-receipts-20261115.json", import.meta.url)));
  const rows = validateStuckVideoSnapshot(actual);
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map(x => x.research_run_id)).size, 5);
  assert.equal(new Set(rows.map(x => x.buffer_post_ids.youtube)).size, 5);
  assert.ok(rows.every(x => Object.keys(x.buffer_post_ids).join() === "youtube"));
});

test("snapshot rejects invented providers, duplicates and malicious URLs before reading Buffer", () => {
  const corrupt = [
    { ...row, status: "approved" },
    { ...row, buffer_post_ids: { youtube: "not-an-id" } },
    { ...row, buffer_post_ids: { youtube: row.buffer_post_ids.youtube, tiktok: "bbbbbbbbbbbbbbbbbbbbbbbb" } },
    { ...row, video_url: "https://lazzdoadoqzrzlarerfx.supabase.co.attacker.example/media/review/test.mp4" },
    { ...row, video_url: row.video_url + "?token=should-not-appear" },
    { ...row, size_bytes: -1 },
    { ...row, publishing_at: "not a date" },
  ];
  for (const bad of corrupt) assert.throws(() => validateStuckVideoSnapshot(snapshot([bad])));
  assert.throws(() => validateStuckVideoSnapshot(snapshot([row, row])), /duplicate/);
});

test("verified evidence remains a review candidate, never a database write or published status", () => {
  const report = summarizeStuckVideoReceipts(validateStuckVideoSnapshot(snapshot()), [receipt(), {
    researchRunId: row.research_run_id, channel: "tiktok", reason: "MISSING_PROVIDER_POST_ID",
  }]);
  assert.equal(report.reviewable, 1);
  assert.equal(report.unresolved, 0);
  assert.equal(report.results[0].status, "REVIEWABLE_PUBLIC_PROOF");
  assert.equal(report.results[0].publicUrl, "https://www.youtube.com/watch?v=AbCdEf12345");
  assert.equal(report.writeActions, 0);
  assert.equal(report.publishActions, 0);
});

test("unplayable, wrong source, absent receipt and fake proof all remain unverified", () => {
  const cases = [
    receipt({ status: "UNVERIFIED", reason: "PUBLIC_MEDIA_UNVERIFIED", publicCheckReason: "PUBLIC_PLAYER_UNPLAYABLE",
      candidatePublicUrl: "https://www.youtube.com/watch?v=AbCdEf12345" }),
    receipt({ sourceProof: { matched: false } }),
    receipt({ attributionVerified: false }),
    receipt({ providerIdentityVerified: false }),
    receipt({ publicUrl: "https://www.youtube.com.attacker.example/watch?v=AbCdEf12345" }),
    receipt({ checkedAt: "invalid" }),
    receipt({ status: "UNVERIFIED", reason: "RAW remote error with secret=abc" }),
  ];
  for (const c of cases) {
    const result = summarizeStuckVideoReceipts(validateStuckVideoSnapshot(snapshot()), [c]);
    assert.equal(result.reviewable, 0);
    assert.equal(result.results[0].status, "HOLD_UNVERIFIED");
    assert.ok(!Object.hasOwn(result.results[0], "publicUrl"));
    assert.doesNotMatch(JSON.stringify(result), /secret=abc|attacker.example|RAW remote/);
  }
});

test("exact provider identity required and unknown additional YouTube posts fail closed", () => {
  const rows = validateStuckVideoSnapshot(snapshot());
  assert.throws(() => summarizeStuckVideoReceipts(rows, [receipt({ postId: "bbbbbbbbbbbbbbbbbbbbbbbb" })]), /Buffer ID mismatch/);
  assert.throws(() => summarizeStuckVideoReceipts(rows, []), /Partial/);
  assert.throws(() => summarizeStuckVideoReceipts(rows, [receipt(), receipt()]), /Duplicate/);
});

test("diagnostic delegates only to existing read-only receipt reconciliation, without provider mutations", async () => {
  const calls = [];
  const report = await runStuckVideoReceiptDiagnostic({
    snapshot: snapshot(), token: "fixture-only", organizationId: "fixture-org",
    reconcile: async (args) => {
      calls.push(args);
      return [receipt()];
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].inventory, validateStuckVideoSnapshot(snapshot()));
  assert.equal(report.reviewable, 1);
  assert.equal(report.writeActions, 0);
  assert.equal(report.publishActions, 0);
});
