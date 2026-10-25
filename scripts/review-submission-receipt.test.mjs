import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
const begin = source.indexOf("async function recordSubmission(");
const end = source.indexOf("async function recordChannel(", begin);
assert.ok(begin >= 0 && end > begin, "a separate submission checkpoint must exist before verified completion");
const make = new Function("db", "githubAuthorized", "clean", "leaseTokenFrom", "json",
  stripTypeScriptTypes(source.slice(begin, end)) + "\nreturn recordSubmission;");
const lease = "2026-10-25T20:00:00.000Z";
const input = { researchRunId: "rv-0123456789abcdef", channel: "youtube", externalId: "exact-post", leaseToken: lease };

function setup({ authorized = true, ids = {}, status = "publishing", storedLease = lease, loseLease = false } = {}) {
  const row = { research_run_id: input.researchRunId, status, publishing_at: storedLease,
    buffer_post_ids: structuredClone(ids), public_urls: {}, published_channels: [] };
  const writes = [];
  let calls = 0;
  const db = { from(name) {
    assert.equal(name, "review_video_queue");
    let patch, filters = [];
    const query = {
      select() { return query; },
      update(value) { patch = value; return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      async maybeSingle() {
        calls++;
        if (patch && loseLease) row.publishing_at = "2026-10-25T20:01:00.000Z";
        const matches = filters.every(([key, value]) => key === "buffer_post_ids"
          ? JSON.stringify(row[key]) === value : row[key] === value);
        if (!matches) return { data: null, error: null };
        if (patch) { writes.push(patch); Object.assign(row, patch); }
        return { data: structuredClone(row), error: null };
      },
    };
    return query;
  } };
  const run = make(db, async () => authorized, (v) => String(v ?? "").trim(),
    (body) => body.leaseToken === lease ? lease : "", (body, status = 200) => ({ body, status }));
  return { row, writes, run: (body = input) => run({}, body), get calls() { return calls; } };
}

test("accepted post ID is durable without claiming that its public URL is verified", async () => {
  const s = setup({ ids: { tiktok: "other-post" } });
  assert.equal((await s.run()).status, 200);
  assert.deepEqual(s.row.buffer_post_ids, { tiktok: "other-post", youtube: "exact-post" });
  assert.deepEqual(s.row.public_urls, {});
  assert.deepEqual(s.row.published_channels, []);
  assert.equal(s.row.status, "publishing");
  assert.equal((await s.run()).status, 200);
  assert.equal(s.writes.length, 1);
});

test("unauthorized, lost-lease, invalid-channel and conflicting IDs cannot overwrite a receipt", async () => {
  for (const [config, body, expected] of [
    [{ authorized: false }, input, 403],
    [{ storedLease: "2026-10-25T19:00:00.000Z" }, input, 409],
    [{ loseLease: true }, input, 409],
    [{ ids: { youtube: "prior-post" } }, input, 409],
    [{}, { ...input, channel: "twitter" }, 400],
    [{}, { ...input, leaseToken: "" }, 400],
  ]) {
    const s = setup(config);
    assert.equal((await s.run(body)).status, expected);
    assert.equal(s.writes.length, 0);
  }
});
