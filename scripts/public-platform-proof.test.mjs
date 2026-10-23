import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { probePublicPostHttp } from "../lib/buffer-review-publisher.mjs";

const url = "https://www.youtube.com/watch?v=AbCdEf12345";
const youtube = (id = "AbCdEf12345", status = "OK", extra = {}) =>
  `<script>var ytInitialPlayerResponse = ${JSON.stringify({ playabilityStatus: { status }, videoDetails: { videoId: id, isPrivate: false, ...extra }, streamingData: { formats: [{ mimeType: "video/mp4", url: "https://media.example/test.mp4" }] } })};</script>`;
const response = (body) => new Response(body, { headers: { "content-type": "text/html" } });
const pending = (error) => error?.code === "PUBLIC_VERIFICATION_PENDING";

test("HTTP 200 missing/private/deleted/consent pages never establish public video availability", async () => {
  for (const body of ["<h1>Video unavailable</h1>", "<h1>Sign in</h1>", youtube("AbCdEf12345", "ERROR"),
    youtube("AbCdEf12345", "LOGIN_REQUIRED"), youtube("different11"), youtube("AbCdEf12345", "OK", { isPrivate: true })]) {
    await assert.rejects(() => probePublicPostHttp({ channel: "youtube", externalLink: url, fetchImpl: async () => response(body) }), pending);
  }
});

test("an exact playable YouTube player response supplies bounded public metadata proof", async () => {
  const proof = await probePublicPostHttp({ channel: "youtube", externalLink: url,
    fetchImpl: async () => response(youtube()), now: () => new Date("2026-10-23T13:00:00Z") });
  assert.equal(proof.status, 200);
  assert.equal(proof.mediaId, "AbCdEf12345");
  assert.equal(proof.publicMediaAvailable, true);
});

test("TikTok requires the exact public video ID, successful detail state, and a video playback address", async () => {
  const tiktokUrl = "https://www.tiktok.com/@blindboxai/video/1234567890";
  const html = (item, statusCode = 0) => `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode, itemInfo: { itemStruct: item } } },
  })}</script>`;
  for (const body of ["<h1>Verify you are human</h1>", html({ id: "999", video: { playAddr: "https://media.example/test.mp4" } }),
    html({ id: "1234567890", privateItem: true, video: { playAddr: "https://media.example/test.mp4" } }),
    html({ id: "1234567890", video: {} }), html({ id: "1234567890", video: { playAddr: "https://media.example/test.mp4" } }, 10216)]) {
    await assert.rejects(() => probePublicPostHttp({ channel: "tiktok", externalLink: tiktokUrl, fetchImpl: async () => response(body) }), pending);
  }
  const proof = await probePublicPostHttp({ channel: "tiktok", externalLink: tiktokUrl,
    fetchImpl: async () => response(html({ id: "1234567890", video: { playAddr: "https://media.example/test.mp4" } })) });
  assert.equal(proof.mediaId, "1234567890");
  assert.equal(proof.publicMediaAvailable, true);
});

test("oversized or stalled bodies fail closed and userinfo is rejected before fetching", async () => {
  let calls = 0;
  await assert.rejects(() => probePublicPostHttp({ channel: "youtube", externalLink: "https://user@www.youtube.com/watch?v=AbCdEf12345",
    fetchImpl: async () => { calls++; return response(youtube()); } }), pending);
  assert.equal(calls, 0);
  await assert.rejects(() => probePublicPostHttp({ channel: "youtube", externalLink: url,
    fetchImpl: async () => response(youtube() + "<!--" + "x".repeat(2 * 1024 * 1024) + "-->") }), pending);
  await assert.rejects(() => probePublicPostHttp({ channel: "youtube", externalLink: url, timeoutMs: 1000,
    fetchImpl: async () => response(new ReadableStream({ start() {} })) }), pending);
});

test("a disposable HTTP service reproduces a false-200 platform response without external accounts", async () => {
  const received = [];
  const server = createServer((request, res) => {
    received.push({ method: request.method, auth: request.headers.authorization });
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<h1>This video is private</h1>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(() => probePublicPostHttp({ channel: "youtube", externalLink: url,
      fetchImpl: async (target, options) => {
        const result = await fetch(`http://127.0.0.1:${server.address().port}`, options);
        Object.defineProperty(result, "url", { value: target });
        return result;
      } }), pending);
    assert.deepEqual(received, [{ method: "GET", auth: undefined }]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
