import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { createReviewSourceVerifier } from "../lib/review-source-identity.mjs";

const approvedUrl = "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/approved.mp4";
const sourceUrl = "https://disposable.public.blob.vercel-storage.com/media/review/mirror.mp4?token=never-log";

test("disposable HTTP source mirror requires complete equal bytes and caches bounded credentialless GETs", async (t) => {
  const bytes = Buffer.from("approved disposable video bytes");
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, undefined);
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": bytes.length });
    res.end(req.url === "/wrong" ? Buffer.alloc(bytes.length) : bytes);
  });
  server.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  let calls = 0;
  const verifier = createReviewSourceVerifier({ fetchImpl: async (url, init) => {
    calls++;
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, undefined);
    return fetch(`http://127.0.0.1:${server.address().port}/${url.includes("wrong.mp4") ? "wrong" : "same"}`, init)
      .then(async r => new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers }));
  } });
  const proof = await verifier({ approvedUrl, sourceUrl, expectedSizeBytes: bytes.length });
  assert.equal(proof.matched, true);
  assert.equal(proof.method, "SHA256");
  assert.equal(proof.approvedSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(proof.sourceSha256, proof.approvedSha256);
  await verifier({ approvedUrl, sourceUrl, expectedSizeBytes: bytes.length });
  assert.equal(calls, 2);
  assert.equal((await verifier({ approvedUrl, sourceUrl: sourceUrl.replace("mirror.mp4", "wrong.mp4") })).reason, "SOURCE_BYTES_DIFFER");
  assert.equal((await verifier({ approvedUrl, sourceUrl, expectedSizeBytes: 1 })).reason, "APPROVED_SOURCE_SIZE_MISMATCH");
  assert.doesNotMatch(JSON.stringify(proof), /never-log|token=/);
});

test("unapproved, credentialed and nonstandard-port sources are rejected before any network call", async () => {
  const verifier = createReviewSourceVerifier({ fetchImpl: async () => { throw new Error("Must not fetch"); } });
  for (const source of ["https://127.0.0.1/mirror.mp4", "https://other.example/mirror.mp4", sourceUrl.replace("https://", "https://secret@"), sourceUrl.replace(".com/", ".com:8443/")]) {
    assert.equal((await verifier({ approvedUrl, sourceUrl: source })).reason, "SOURCE_URL_UNAPPROVED");
  }
});

test("source size limits, redirects, MIME, raw errors and stalled bodies fail closed", async () => {
  for (const [response, reason] of [
    [new Response("x", { status: 403 }), "SOURCE_HTTP_STATUS"],
    [new Response("x", { headers: { "content-type": "text/html" } }), "SOURCE_CONTENT_TYPE"],
    [new Response("x", { headers: { "content-type": "video/mp4", "content-length": String(33 * 1024 * 1024) } }), "SOURCE_SIZE_LIMIT"],
    [new Response(new Uint8Array(33 * 1024 * 1024), { headers: { "content-type": "video/mp4" } }), "SOURCE_SIZE_LIMIT"],
    [{ status: 200, redirected: true, body: new Response("x").body }, "SOURCE_REDIRECT"],
  ]) {
    const verify = createReviewSourceVerifier({ fetchImpl: async () => response instanceof Response ? response.clone() : { ...response, body: new Response("x").body } });
    assert.equal((await verify({ approvedUrl, sourceUrl })).reason, reason);
  }
  const stalled = createReviewSourceVerifier({ timeoutMs: 15, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "video/mp4" } }) });
  assert.equal((await stalled({ approvedUrl, sourceUrl })).reason, "SOURCE_TIMEOUT");
  const unsafeError = createReviewSourceVerifier({ fetchImpl: async () => { throw new Error("private token=never-log"); } });
  assert.doesNotMatch(JSON.stringify(await unsafeError({ approvedUrl, sourceUrl })), /private|never-log|token=/);
});
