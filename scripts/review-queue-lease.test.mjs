import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fn = readFileSync("supabase/functions/review-video-queue/index.ts", "utf8");
const wf = readFileSync(".github/workflows/publish-approved-reviews.yml", "utf8");
const claimBody = fn.slice(fn.indexOf("async function claim("), fn.indexOf("async function recordChannel("));

test("claim surfaces database errors instead of reporting an empty queue", () => {
  assert.match(claimBody, /error: claimError/);
  assert.match(claimBody, /if \(claimError\) return json\(\{ error: "Queue claim failed" \}, 500\)/);
});

test("stale publishing leases are reclaimable after the lease window", () => {
  assert.match(fn, /STALE_PUBLISHING_LEASE_MS = 45 \* 60 \* 1000/);
  assert.match(claimBody, /\.or\(claimableStatusFilter\(\)\)/);
  assert.doesNotMatch(claimBody, /\.eq\("status", "approved"\)/);
});

test("workflow timeout is shorter than the publishing lease", () => {
  const m = wf.match(/timeout-minutes:\s*(\d+)/);
  assert.ok(m, "timeout-minutes missing");
  assert.ok(Number(m[1]) < 45, "job timeout must be shorter than the 45-minute lease");
});

test("peek stays read-only and the claimable filter still requires approval", () => {
  const peekBody = fn.slice(fn.indexOf("async function peek("), fn.indexOf("async function claim("));
  assert.ok(peekBody.length > 0, "peek function not found before claim");
  assert.doesNotMatch(peekBody, /\.update\(|\.upsert\(|\.delete\(/);
  assert.match(fn, /status\.eq\.approved,and\(status\.eq\.publishing,publishing_at\.lt\./);
});
