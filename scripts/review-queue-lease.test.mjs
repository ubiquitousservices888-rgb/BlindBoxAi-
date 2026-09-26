import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const fn = read("../supabase/functions/review-video-queue/index.ts");
const wf = read("../.github/workflows/publish-approved-reviews.yml");
const runner = read("./publish-approved-review-queue.mjs");
const between = (a, b) => {
  const start = fn.indexOf(a);
  const end = fn.indexOf(b);
  assert.ok(start >= 0, `section start not found: ${a}`);
  assert.ok(end > start, `section end not found after ${a}: ${b}`);
  return fn.slice(start, end);
};
const claimBody = between("async function claim(", "async function recordChannel(");
const recordBody = between("async function recordChannel(", "async function release(");
const releaseBody = between("async function release(", "async function complete(");
const completeBody = between("async function complete(", "Deno.serve(");
const peekBody = between("async function peek(", "async function claim(");
const count = (s, re) => (s.match(re) || []).length;

test("claim surfaces database errors instead of reporting an empty queue", () => {
  assert.match(claimBody, /error: claimError/);
  assert.match(claimBody, /if \(claimError\) return json\(\{ error: "Queue claim failed" \}, 500\)/);
});

test("stale publishing leases are reclaimable", () => {
  assert.match(claimBody, /\.or\(claimableStatusFilter\(\)\)/);
  assert.doesNotMatch(claimBody, /\.eq\("status", "approved"\)/);
});

test("workflow timeout is shorter than the publishing lease (derived, not hardcoded)", () => {
  const lease = fn.match(/STALE_PUBLISHING_LEASE_MS = (\d+) \* 60 \* 1000/);
  const timeout = wf.match(/timeout-minutes:\s*(\d+)/);
  assert.ok(lease, "STALE_PUBLISHING_LEASE_MS missing");
  assert.ok(timeout, "timeout-minutes missing");
  assert.ok(Number(timeout[1]) < Number(lease[1]), "job timeout must be shorter than the lease");
});

test("peek stays read-only and the claimable filter still requires approval", () => {
  assert.ok(peekBody.length > 0, "peek function not found before claim");
  assert.doesNotMatch(peekBody, /\.update\(|\.upsert\(|\.delete\(/);
  assert.match(fn, /status\.eq\.approved,and\(status\.eq\.publishing,publishing_at\.lt\./);
});

test("claim hands the lease token to the publisher", () => {
  assert.match(claimBody, /public_urls,publishing_at"\)/);
});

test("every lease-holder write is fenced by the lease token", () => {
  for (const [name, b, min] of [["record_channel", recordBody, 2], ["release", releaseBody, 1], ["complete", completeBody, 1]]) {
    assert.match(b, /if \(!leaseToken\) return json\(\{ error: "Invalid lease token" \}, 400\)/, `${name} must reject missing lease`);
    assert.ok(count(b, /\.eq\("publishing_at", leaseToken\)/g) >= min, `${name} must fence on publishing_at`);
  }
});

test("runner sends the lease token on record, release, and complete", () => {
  assert.match(runner, /required\(item\.publishing_at, "queue lease token"\)/);
  assert.equal(count(runner, /^\s+leaseToken,$/gm), 4);
});
