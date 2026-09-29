import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectPaginatedRows, REVIEW_QUEUE_OVERFLOW_ERROR } from "../supabase/functions/_shared/review-queue-pagination.mjs";

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
  assert.match(runner, /const leaseToken = dryRun \? "" : String\(item\.publishing_at \?\? ""\)\.trim\(\)/);
  assert.match(runner, /if \(!dryRun\) required\(leaseToken, "queue lease token"\)/);
  assert.equal(count(runner, /^\s+leaseToken,$/gm), 4);
});


test("owner queue list uses the tested ready-only pagination helper", () => {
  const pageSize = fn.match(/const OWNER_REVIEW_PAGE_SIZE = (\d+);/);
  assert.ok(pageSize, "owner review page size must be named");
  assert.ok(Number(pageSize[1]) >= 100, "owner review page size must be at least 100");
  const listBody = between("async function listReady(", "async function approve(");
  assert.match(listBody, /collectPaginatedRows\(\{/);
  assert.match(listBody, /pageSize: OWNER_REVIEW_PAGE_SIZE/);
  assert.match(listBody, /maxPages: OWNER_REVIEW_MAX_PAGES/);
  assert.match(listBody, /\.eq\("status", "ready_for_review"\)/);
  assert.match(listBody, /\.range\(from, to\)/);
  assert.match(listBody, /message === REVIEW_QUEUE_OVERFLOW_ERROR/);
  assert.doesNotMatch(listBody, /\.limit\(20\)/);
});

test("owner queue pagination fails closed when every page reaches the maximum bound", async () => {
  const ranges = [];
  await assert.rejects(
    collectPaginatedRows({
      pageSize: 2,
      maxPages: 3,
      fetchPage: async (from, to) => {
        ranges.push([from, to]);
        return [{ id: from }, { id: to }];
      },
    }),
    (error) => {
      assert.equal(error?.message, REVIEW_QUEUE_OVERFLOW_ERROR);
      return true;
    },
  );
  assert.deepEqual(ranges, [[0, 1], [2, 3], [4, 5]]);
});

test("owner queue pagination returns the complete list when the final page is partial", async () => {
  const pages = [
    [{ id: 1 }, { id: 2 }],
    [{ id: 3 }, { id: 4 }],
    [{ id: 5 }],
  ];
  let call = 0;
  const items = await collectPaginatedRows({
    pageSize: 2,
    maxPages: 3,
    fetchPage: async () => pages[call++] ?? [],
  });
  assert.deepEqual(items.map((item) => item.id), [1, 2, 3, 4, 5]);
  assert.equal(call, 3);
});
