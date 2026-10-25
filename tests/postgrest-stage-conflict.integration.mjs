import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Requires only a disposable local PostgREST server and PostgreSQL table.
// This exercises actual PostgREST INSERT ... ON CONFLICT DO NOTHING semantics.
// Each test uses a fresh fixture ID and deletes only its own disposable row.
const root = process.env.DISPOSABLE_POSTGREST_URL || "http://127.0.0.1:3000";
assert.ok(new URL(root).protocol === "http:" && ["127.0.0.1", "localhost"].includes(new URL(root).hostname), "disposable database must be loopback-only");
const fixtureId = () => "rv-" + randomBytes(8).toString("hex");
async function request(method, path, body, prefer) {
  const response = await fetch(root + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error("disposable PostgREST status " + response.status + " " + responseText.slice(0, 500));
  return responseText ? JSON.parse(responseText) : null;
}
function cleanupAfter(t, id) {
  t.after(async () => {
    await request("DELETE", "/review_video_queue?research_run_id=eq." + id, undefined, "return=minimal");
  });
}
test("PostgREST conflict-ignore preserves owner approval, title and media URL", async (t) => {
  const id = fixtureId();
  cleanupAfter(t, id);
  const initial = { research_run_id: id, status: "ready_for_review", title: "Original owner-reviewed title", video_url: "https://example.test/canonical.mp4" };
  const newInsert = await request("POST", "/review_video_queue?on_conflict=research_run_id", [initial], "resolution=ignore-duplicates,return=representation");
  assert.equal(newInsert.length, 1);
  await request("PATCH", "/review_video_queue?research_run_id=eq." + id, { status: "approved" }, "return=representation");
  const retry = { ...initial, status: "ready_for_review", title: "Malicious or stale changed title", video_url: "https://example.test/swapped.mp4" };
  const conflicted = await request("POST", "/review_video_queue?on_conflict=research_run_id", [retry], "resolution=ignore-duplicates,return=representation");
  assert.deepEqual(conflicted, [], "PostgREST must not return an inserted row after ignored conflict");
  const rows = await request("GET", "/review_video_queue?research_run_id=eq." + id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "approved");
  assert.equal(rows[0].title, initial.title);
  assert.equal(rows[0].video_url, initial.video_url);
});
test("PostgREST preserves rejected records against restaging", async (t) => {
  const rejected = fixtureId();
  cleanupAfter(t, rejected);
  const base = { research_run_id: rejected, status: "rejected", title: "Owner rejected video", video_url: "https://example.test/rejected.mp4" };
  const newInsert = await request("POST", "/review_video_queue?on_conflict=research_run_id", [base], "resolution=ignore-duplicates,return=representation");
  assert.equal(newInsert.length, 1);
  const duplicate = await request("POST", "/review_video_queue?on_conflict=research_run_id", [{ ...base, status: "ready_for_review" }], "resolution=ignore-duplicates,return=representation");
  assert.deepEqual(duplicate, []);
  const [stored] = await request("GET", "/review_video_queue?research_run_id=eq." + rejected);
  assert.equal(stored.status, "rejected");
});

// Execute the real production checkpoint against actual HTTP/PostgreSQL
// semantics, including JSON equality and stale-lease compare-and-set failures.
function submissionHandler(beforeUpdate) {
  const source = readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  const begin = source.indexOf("async function recordSubmission(");
  const end = source.indexOf("async function recordChannel(", begin);
  assert.ok(begin >= 0 && end > begin);
  const db = { from(name) {
    assert.equal(name, "review_video_queue");
    const params = new URLSearchParams();
    let patch;
    const builder = {
      select(columns) { params.set("select", columns); return builder; },
      eq(column, value) { params.set(column, `eq.${value}`); return builder; },
      update(value) { patch = value; return builder; },
      async maybeSingle() {
        if (patch && beforeUpdate) await beforeUpdate();
        const rows = await request(patch ? "PATCH" : "GET", `/review_video_queue?${params}`, patch, patch ? "return=representation" : undefined);
        return { data: rows?.[0] || null, error: null };
      },
    };
    return builder;
  } };
  return new Function("db", "githubAuthorized", "clean", "leaseTokenFrom", "json",
    stripTypeScriptTypes(source.slice(begin, end)) + "\nreturn recordSubmission;")(
    db, async () => true, v => String(v ?? "").trim(), body => body.leaseToken,
    (body, status = 200) => ({ status, body }),
  );
}

test("actual submission checkpoint preserves other channel IDs and never marks a publication", async t => {
  const id = fixtureId(), lease = "2026-10-25T20:00:00.000Z";
  cleanupAfter(t, id);
  await request("POST", "/review_video_queue", [{ research_run_id: id, status: "publishing", title: "Disposable checkpoint", video_url: "https://example.test/review.mp4", publishing_at: lease, buffer_post_ids: { tiktok: "prior-tiktok" } }], "return=minimal");
  const handler = submissionHandler();
  const body = { researchRunId: id, leaseToken: lease, channel: "youtube", externalId: "accepted-youtube" };
  assert.equal((await handler({}, body)).status, 200);
  assert.equal((await handler({}, body)).body.idempotent, true);
  assert.equal((await handler({}, { ...body, externalId: "conflicting-post" })).status, 409);
  const [stored] = await request("GET", `/review_video_queue?research_run_id=eq.${id}`);
  assert.deepEqual(stored.buffer_post_ids, { tiktok: "prior-tiktok", youtube: "accepted-youtube" });
  assert.equal(stored.status, "publishing");
  assert.deepEqual(stored.published_channels, []);
  assert.deepEqual(stored.public_urls, {});
});

test("PostgREST CAS refuses both a changed receipt map and a replaced publishing lease", async t => {
  for (const concurrentPatch of [{ buffer_post_ids: { tiktok: "concurrent-tiktok" } }, { publishing_at: "2026-10-25T20:01:00Z" }]) {
    const id = fixtureId(), lease = "2026-10-25T20:00:00.000Z";
    cleanupAfter(t, id);
    await request("POST", "/review_video_queue", [{ research_run_id: id, status: "publishing", title: "Disposable CAS", video_url: "https://example.test/review.mp4", publishing_at: lease }], "return=minimal");
    const handler = submissionHandler(() => request("PATCH", `/review_video_queue?research_run_id=eq.${id}`, concurrentPatch, "return=minimal"));
    assert.equal((await handler({}, { researchRunId: id, leaseToken: lease, channel: "youtube", externalId: "stale-writer" })).status, 409);
    const [stored] = await request("GET", `/review_video_queue?research_run_id=eq.${id}`);
    assert.equal(stored.buffer_post_ids.youtube, undefined);
    assert.deepEqual(stored.public_urls, {});
  }
});
