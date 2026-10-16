import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Disposable PostgREST contract for the future durable scheduling backend.
// This test never calls Buffer or production Supabase. It must run against
// the ephemeral schema in disposable-buffer-schedule-claim.yml.
const root = process.env.DISPOSABLE_POSTGREST_URL || "http://127.0.0.1:3000";
const fixture = () => "rv-" + randomBytes(8).toString("hex");
async function api(method, path, data, prefer) {
  const response = await fetch(root + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await response.text();
  assert.equal(response.status >= 200 && response.status < 300, true,
    "disposable PostgREST returned HTTP " + response.status);
  return body ? JSON.parse(body) : null;
}
const keyPath = (id, channel) =>
  "/review_schedule_claims?research_run_id=eq." + id + "&channel=eq." + channel;
const claim = (row) => api("POST",
  "/review_schedule_claims?on_conflict=research_run_id,channel",
  [row], "resolution=ignore-duplicates,return=representation");

test("16 concurrent scheduling attempts yield exactly one durable claim", async (t) => {
  const id = fixture();
  const row = {research_run_id:id, channel:"youtube",
    media_url:"https://example.test/owner-reviewed.mp4", status:"claimed"};
  t.after(async () => api("DELETE",keyPath(id,"youtube"),undefined,"return=minimal"));
  const results = await Promise.all(Array.from({length:16}, () => claim(row)));
  assert.equal(results.filter(x => x.length === 1).length,1);
  assert.equal(results.filter(x => x.length === 0).length,15);
  const stored = await api("GET",keyPath(id,"youtube"));
  assert.equal(stored.length,1);
  assert.equal(stored[0].media_url,row.media_url);
  assert.equal(stored[0].status,"claimed");
});

test("ambiguous Buffer response retains claim; retries cannot create a second", async (t) => {
  const id = fixture();
  const row = {research_run_id:id,channel:"tiktok",
    media_url:"https://example.test/canonical.mp4",status:"claimed"};
  t.after(async () => api("DELETE",keyPath(id,"tiktok"),undefined,"return=minimal"));
  assert.equal((await claim(row)).length,1);
  assert.deepEqual(await claim({...row,media_url:"https://example.test/swapped.mp4"}),[]);
  const [stored] = await api("GET",keyPath(id,"tiktok"));
  assert.equal(stored.media_url,row.media_url);
  assert.equal(stored.status,"claimed");
  assert.equal(stored.buffer_post_id,null);
});

test("Buffer scheduled receipt is not a verified public-platform receipt", async (t) => {
  const id = fixture();
  const row = {research_run_id:id,channel:"youtube",
    media_url:"https://example.test/canonical.mp4",status:"claimed"};
  t.after(async () => {
    await api("DELETE","/review_publication_receipts?research_run_id=eq."+id,
      undefined,"return=minimal");
    await api("DELETE",keyPath(id,"youtube"),undefined,"return=minimal");
  });
  await claim(row);
  const updated = await api("PATCH",keyPath(id,"youtube"),
    {status:"scheduled",buffer_post_id:"disposable-buffer-receipt",
      due_at:"2026-10-18T14:00:00Z"},"return=representation");
  assert.equal(updated.length,1);
  assert.equal(updated[0].status,"scheduled");
  assert.equal(updated[0].buffer_post_id,"disposable-buffer-receipt");
  assert.equal(updated[0].public_url,undefined);
  const published = await api("GET",
    "/review_publication_receipts?research_run_id=eq."+id);
  assert.deepEqual(published,[],
    "scheduled Buffer receipt must not create a confirmed public URL");
});

test("same media can be claimed independently for YouTube and TikTok", async (t) => {
  const id = fixture();
  const media_url="https://example.test/canonical.mp4";
  t.after(async () => {
    for(const channel of ["youtube","tiktok"])
      await api("DELETE",keyPath(id,channel),undefined,"return=minimal");
  });
  const results = await Promise.all(["youtube","tiktok"].map(channel =>
    claim({research_run_id:id,channel,media_url,status:"claimed"})));
  assert.deepEqual(results.map(x=>x.length),[1,1]);
});
