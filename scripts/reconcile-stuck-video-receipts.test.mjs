import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStuckVideoSnapshot, summarizeStuckVideoReceipts } from "../lib/stuck-video-receipt-recovery.mjs";
import { runStuckVideoReceiptDiagnostic } from "./reconcile-stuck-video-receipts.mjs";

// Independently pinned against the owner's read-only Supabase query on 2026-11-15.
// This must not be derived from the inventory under test.
const EXPECTED = {
  "rv-3658d7e94a70b562": ["6af206e07176a1c926fec680", "1790412198708-4639.mp4", 9336833],
  "rv-3c9c9bb78c37ff6a": ["6af206753aa5c0b251b55b48", "sha256-7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0.mp4", 121797],
  "rv-4815685fb0b10117": ["6af206094af3cc032bb492db", "1794241590727-3972.mp4", 7754855],
  "rv-6b6023cb4aaaca52": ["6af2064dc1ebd32415dc5e2f", "1794241144945-3973.mp4", 3904477],
  "rv-9c5d343830fb30a8": ["6af206e03aa5c0b251b59707", "1790216466129-3143.mp4", 4963475],
};
const PREFIX = "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/";
const original = JSON.parse(readFileSync(new URL("../data/stuck-review-video-receipts-20261115.json", import.meta.url), "utf8"));
const snapshot = (rows = original.rows) => ({ ...original, rows });

function receipt(row, index, change = {}) {
  const mediaId = "AbCdEf" + String(index).padStart(5, "0");
  return {
    researchRunId: row.research_run_id, postId: row.buffer_post_ids.youtube, channel: "youtube",
    status: "VERIFIED", providerIdentityVerified: true, attributionVerified: true,
    sourceProof: { matched: true, method: "EXACT_URL" },
    publicUrl: "https://www.youtube.com/watch?v=" + mediaId,
    checkedAt: "2026-11-15T20:00:00Z", ...change,
  };
}
const validReceipts = (rows) => rows.map((row, i) => receipt(row, i));

test("inventory must match all five independently pinned run, post, media URL, and byte size tuples", () => {
  const rows = validateStuckVideoSnapshot(original);
  assert.equal(rows.length, 5);
  const actual = Object.fromEntries(rows.map(row => [
    row.research_run_id,
    [row.buffer_post_ids.youtube, row.video_url, row.size_bytes],
  ]));
  const expected = Object.fromEntries(Object.entries(EXPECTED).map(([run, [post, filename, size]]) =>
    [run, [post, PREFIX + filename, size]]));
  assert.deepEqual(actual, expected);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(EXPECTED).sort());
});

test("missing, extra, swapped, or invented records are rejected before provider access", () => {
  const rows = original.rows;
  const first = rows[0];
  const second = rows[1];
  const corruptions = [
    rows.slice(1),
    [...rows, { ...first, research_run_id: "rv-aaaaaaaaaaaaaaaa" }],
    [first, first, ...rows.slice(2)],
    [{ ...first, research_run_id: "rv-aaaaaaaaaaaaaaaa" }, ...rows.slice(1)],
    [{ ...first, buffer_post_ids: { youtube: second.buffer_post_ids.youtube } }, ...rows.slice(1)],
    [{ ...first, video_url: second.video_url }, ...rows.slice(1)],
    [{ ...first, size_bytes: second.size_bytes }, ...rows.slice(1)],
    [{ ...first, video_url: "https://lazzdoadoqzrzlarerfx.supabase.co.attacker.example/review/a.mp4" }, ...rows.slice(1)],
    [{ ...first, video_url: first.video_url + "?token=private" }, ...rows.slice(1)],
    [{ ...first, status: "approved" }, ...rows.slice(1)],
    [{ ...first, publishing_at: "unknown" }, ...rows.slice(1)],
    [{ ...first, buffer_post_ids: { ...first.buffer_post_ids, tiktok: "bbbbbbbbbbbbbbbbbbbbbbbb" } }, ...rows.slice(1)],
  ];
  for (const rowsBad of corruptions) assert.throws(() => validateStuckVideoSnapshot(snapshot(rowsBad)));
});

test("exact verified public player evidence remains a candidate, not a DB mutation or published row", () => {
  const rows = validateStuckVideoSnapshot(original);
  const report = summarizeStuckVideoReceipts(rows, [
    ...validReceipts(rows),
    { channel: "tiktok", researchRunId: rows[0].research_run_id, reason: "NOT_SUBMITTED" },
  ]);
  assert.equal(report.reviewable, 5);
  assert.equal(report.unresolved, 0);
  assert.equal(report.results[0].status, "REVIEWABLE_PUBLIC_PROOF");
  assert.equal(report.writeActions, 0);
  assert.equal(report.publishActions, 0);
});

test("unplayable, wrong source, wrong provider, fake or untrusted proof never become verified", () => {
  const rows = validateStuckVideoSnapshot(original);
  const cases = [
    { status: "UNVERIFIED", reason: "PUBLIC_MEDIA_UNVERIFIED", publicCheckReason: "PUBLIC_PLAYER_UNPLAYABLE",
      candidatePublicUrl: "https://www.youtube.com/watch?v=AbCdEf00000" },
    { sourceProof: { matched: false } },
    { attributionVerified: false },
    { providerIdentityVerified: false },
    { publicUrl: "https://www.youtube.com.attacker.example/watch?v=AbCdEf00000" },
    { checkedAt: "invalid" },
    { status: "UNVERIFIED", reason: "RAW remote error with secret=abc" },
  ];
  for (const change of cases) {
    const receipts = validReceipts(rows);
    receipts[0] = receipt(rows[0], 0, change);
    const result = summarizeStuckVideoReceipts(rows, receipts);
    assert.equal(result.reviewable, 4);
    assert.equal(result.results[0].status, "HOLD_UNVERIFIED");
    assert.ok(!Object.hasOwn(result.results[0], "publicUrl"));
    assert.doesNotMatch(JSON.stringify(result), /secret=abc|attacker.example|RAW remote/);
  }
});

test("mismatched, missing and repeated exact Buffer receipts fail closed", () => {
  const rows = validateStuckVideoSnapshot(original);
  const receipts = validReceipts(rows);
  assert.throws(() => summarizeStuckVideoReceipts(rows, [
    receipt(rows[0], 0, { postId: "bbbbbbbbbbbbbbbbbbbbbbbb" }), ...receipts.slice(1),
  ]), /Buffer ID mismatch/);
  assert.throws(() => summarizeStuckVideoReceipts(rows, receipts.slice(1)), /Partial/);
  assert.throws(() => summarizeStuckVideoReceipts(rows, [...receipts, receipts[0]]), /Duplicate/);
});

test("recovery diagnostic delegates only to existing read-only Buffer receipt inspection", async () => {
  const rows = validateStuckVideoSnapshot(original);
  const calls = [];
  const report = await runStuckVideoReceiptDiagnostic({
    snapshot: original, token: "fake-test-token", organizationId: "fake-org",
    reconcile: async args => {
      calls.push(args);
      return validReceipts(rows);
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].inventory, rows);
  assert.equal(report.reviewable, 5);
  assert.equal(report.writeActions, 0);
  assert.equal(report.publishActions, 0);
});

test("workflow runs both diagnostics on ordinary failure, but not after cancellation", () => {
  const workflow = readFileSync(new URL("../.github/workflows/buffer-organization-diagnostic.yml", import.meta.url), "utf8");
  const runner = readFileSync(new URL("./reconcile-stuck-video-receipts.mjs", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches:\s*\n\s*-\s+main/);
  assert.match(workflow, /run: node scripts\/reconcile-stuck-video-receipts\.mjs/);
  assert.match(workflow, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.doesNotMatch(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(runner, /reconcilePublicVideoUrls/);
  assert.doesNotMatch(runner, /bufferGraphQL|mutation\s|shareNow|customScheduled|record_channel|record_submission|UPDATE\s|DELETE\s|INSERT\s/i);
});
