import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Requires only a disposable local PostgREST server and PostgreSQL table.
// This exercises actual PostgREST INSERT ... ON CONFLICT DO NOTHING semantics.
// Each test uses a fresh fixture ID and deletes only its own disposable row.
const root = process.env.DISPOSABLE_POSTGREST_URL || "http://127.0.0.1:3000";
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
