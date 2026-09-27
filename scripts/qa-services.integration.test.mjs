import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { REVIEW_YOUTUBE_CHANNEL_ID, resolveReviewBufferChannel } from "../lib/buffer-review-publisher.mjs";
import { recordAffiliateClick, recordAnalyticsEvent } from "../lib/supabase-telemetry.mjs";

async function localService(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

test("site telemetry reaches an isolated Supabase Edge contract with distinct event and click types", async () => {
  const received = [];
  const service = await localService(async (request, response) => {
    const body = await readJson(request);
    received.push({ path: request.url, method: request.method, auth: request.headers["x-telemetry-authorization"], body });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  const prior = Object.fromEntries(["SUPABASE_URL", "EVIDENCE_UPLOAD_CODE", "BLINDBOXAI_ALLOW_TEST_INGEST"]
    .map((key) => [key, process.env[key]]));
  try {
    assert.equal(new URL(service.url).hostname, "127.0.0.1");
    process.env.SUPABASE_URL = service.url;
    process.env.EVIDENCE_UPLOAD_CODE = "qa-local-only";
    process.env.BLINDBOXAI_ALLOW_TEST_INGEST = "true";
    await recordAnalyticsEvent({ event: "page_view", namespace: "qa", test: true, campaign: "qa-234" });
    await recordAffiliateClick({ event: "outbound_affiliate_click", namespace: "qa", test: true, campaignId: "qa-234" });
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await service.close();
  }
  assert.deepEqual(received.map(({ path, method, body }) => [path, method, body.type]), [
    ["/functions/v1/distribution-telemetry", "POST", "event"],
    ["/functions/v1/distribution-telemetry", "POST", "click"],
  ]);
  assert.ok(received.every(({ auth, body }) => auth === "Bearer qa-local-only" && body.event.test === true));
  assert.equal(received[1].body.event.campaignId, "qa-234");
});

test("review publisher resolves the exact YouTube destination across Buffer's HTTP contract", async () => {
  const operations = [];
  const service = await localService(async (request, response) => {
    const body = await readJson(request);
    operations.push({ method: request.method, auth: request.headers.authorization, body });
    const data = body.query.includes("query Organizations")
      ? { account: { organizations: [{ id: "qa-org", name: "QA only" }] } }
      : body.query.includes("query Channels")
        ? { channels: [
          { id: "qa-youtube", service: "youtube", serviceId: REVIEW_YOUTUBE_CHANNEL_ID,
            isDisconnected: false, isLocked: false, isQueuePaused: false },
          { id: "qa-other", service: "youtube", serviceId: "wrong-channel",
            isDisconnected: false, isLocked: false, isQueuePaused: false },
        ] }
        : null;
    response.writeHead(data ? 200 : 400, { "content-type": "application/json" });
    response.end(JSON.stringify({ data }));
  });
  try {
    const target = await resolveReviewBufferChannel({
      token: "qa-token", organizationId: "qa-org", channel: "youtube",
      fetchImpl: (url, options) => {
        assert.equal(url, "https://api.buffer.com");
        return fetch(service.url, options);
      },
    });
    assert.equal(target.id, "qa-youtube");
    assert.equal(target.serviceId, REVIEW_YOUTUBE_CHANNEL_ID);
    assert.deepEqual(operations.map(({ body }) => body.variables), [{}, { organizationId: "qa-org" }]);
    assert.ok(operations.every(({ method, auth, body }) => method === "POST" && auth === "Bearer qa-token" && !/mutation/i.test(body.query)));
  } finally {
    await service.close();
  }
});
