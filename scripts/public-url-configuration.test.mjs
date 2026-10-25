import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import { createReviewBufferPublisher, probePublicPostHttp, waitForVerifiedSentPost, REVIEW_YOUTUBE_CHANNEL_ID } from "../lib/buffer-review-publisher.mjs";

const caption = `Collector research https://blindboxai.com/?campaign=bb-rv-0123456789abcdef\n${DISCLOSURE}`;
const publicUrl = "https://www.youtube.com/watch?v=AbCdEf12345";
const post = { id: "exact-post", channelId: "exact-channel", text: caption, status: "sent", externalLink: publicUrl };
const proof = { status: 200, checkedAt: "2026-10-25T20:00:00Z", publicMediaAvailable: true, mediaId: "AbCdEf12345" };
const options = { token: "disposable-token", organizationId: "disposable-org", channelId: "exact-channel", channel: "youtube", postId: "exact-post", expectedCaption: caption, attempts: 2, delayMs: 0 };

test("disposable Buffer HTTP service retries sent-before-URL without creating another post", async () => {
  const operations = [];
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const operation = JSON.parse(raw);
    operations.push(operation);
    const current = { ...post, externalLink: operations.length === 1 ? null : publicUrl };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: { post: current, posts: { edges: [{ node: current }], pageInfo: { hasNextPage: false } } } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await waitForVerifiedSentPost({ ...options,
      fetchImpl: (_url, init) => fetch(`http://127.0.0.1:${server.address().port}`, init),
      httpProbeImpl: async () => proof,
    });
    assert.equal(result.publicUrl, publicUrl);
    assert.equal(operations.length, 2);
    assert.ok(operations.every(op => !/mutation/.test(op.query)));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("exact post lookup rejects a receipt from a different channel before probing", async () => {
  let probes = 0;
  const wrong = { ...post, channelId: "wrong-channel" };
  await assert.rejects(() => waitForVerifiedSentPost({ ...options,
    fetchImpl: async () => new Response(JSON.stringify({ data: { post: wrong, posts: { edges: [{ node: wrong }] } } })),
    httpProbeImpl: async () => { probes++; return proof; },
  }));
  assert.equal(probes, 0);
});

test("YouTube permalink variants use one credentialless canonical watch request", async () => {
  const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify({ playabilityStatus: { status: "OK" }, videoDetails: { videoId: "AbCdEf12345" }, streamingData: { formats: [{ mimeType: "video/mp4", url: "https://media.example/test.mp4" }] } })};</script>`;
  for (const externalLink of ["https://youtu.be/AbCdEf12345?si=share", "https://m.youtube.com/shorts/AbCdEf12345", "https://youtube.com/live/AbCdEf12345?feature=share"]) {
    const result = await probePublicPostHttp({ channel: "youtube", externalLink, fetchImpl: async (url, init) => {
      assert.equal(url, publicUrl);
      assert.equal(init.redirect, "manual");
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers.Authorization, undefined);
      return new Response(html, { headers: { "content-type": "text/html" } });
    } });
    assert.equal(result.mediaId, "AbCdEf12345");
  }
});

test("accepted provider receipt is checkpointed before verification and reused without another create", async () => {
  let creates = 0;
  const order = [];
  const videoUrl = "https://media.example/video.mp4";
  const fetchImpl = async (url, init) => {
    if (String(url) === videoUrl) return new Response(null, { status: 206, headers: { "content-type": "video/mp4" } });
    const { query } = JSON.parse(init.body);
    const data = query.includes("query Organizations") ? { account: { organizations: [{ id: "disposable-org" }] } }
      : query.includes("query Channels") ? { channels: [{ id: post.channelId, service: "youtube", serviceId: REVIEW_YOUTUBE_CHANNEL_ID }] }
      : query.includes("query Existing") ? { posts: { edges: [], pageInfo: { hasNextPage: false } } }
      : query.includes("mutation") ? (creates++, { createPost: { post: { id: post.id } } })
      : (order.push("verify"), { post });
    return new Response(JSON.stringify({ data }));
  };
  const publisher = createReviewBufferPublisher({ token: options.token, organizationId: options.organizationId, fetchImpl,
    mediaProbe: async () => ({}), publicHttpProbe: async () => proof });
  const request = { channel: "youtube", videoUrl, caption, title: "Collector research", youtubeMadeForKids: false,
    onAccepted: async ({ postId }) => { assert.equal(postId, post.id); order.push("checkpoint"); } };
  await publisher(request);
  assert.deepEqual(order, ["checkpoint", "verify"]);
  assert.equal(creates, 1);
  order.length = 0;
  const reused = await publisher({ ...request, acceptedPostId: post.id });
  assert.equal(reused.duplicate, true);
  assert.equal(creates, 1);
  assert.deepEqual(order, ["verify"]);
  await assert.rejects(() => publisher({ ...request, onAccepted: async () => { throw new Error("disposable DB failure"); } }),
    error => error.code === "PUBLIC_VERIFICATION_PENDING" && error.postId === post.id);
});

test("processing has a bounded deadline and delayed empty URLs report reconciliation pending", async () => {
  let time = 0, reads = 0;
  await assert.rejects(() => waitForVerifiedSentPost({ ...options, attempts: 100, delayMs: 5000, timeoutMs: 1000,
    clock: () => time, sleepImpl: async ms => { time += ms; },
    fetchImpl: async () => { reads++; return new Response(JSON.stringify({ data: { post: { ...post, externalLink: null } } })); },
  }), error => error.code === "PUBLIC_VERIFICATION_PENDING" && error.reason === "BUFFER_PUBLIC_URL_PENDING" && error.postId === post.id);
  assert.equal(reads, 1);
});
