import assert from "node:assert/strict";
import test from "node:test";

import {
  getDistributionTelemetry,
  recordAffiliateClick,
  recordAnalyticsEvent,
} from "../lib/supabase-telemetry.mjs";

async function withTelemetryCode(fn) {
  const previous = process.env.EVIDENCE_UPLOAD_CODE;
  process.env.EVIDENCE_UPLOAD_CODE = "test-telemetry-code";
  try { await fn(); } finally {
    if (previous === undefined) delete process.env.EVIDENCE_UPLOAD_CODE;
    else process.env.EVIDENCE_UPLOAD_CODE = previous;
  }
}

function response(body = { ok: true }, status = 202) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("affiliate clicks use the Supabase telemetry edge function with existing BlindBoxAI auth", async () => {
  await withTelemetryCode(async () => {
    let call;
    await recordAffiliateClick({ provider: "ebay_epn", clickedAt: "2026-09-15T20:00:00Z", piiStored: false }, {
      fetchImpl: async (url, options) => { call = { url, options }; return response(); },
    });
    assert.match(call.url, /\/functions\/v1\/distribution-telemetry$/);
    assert.equal(call.options.headers["x-telemetry-authorization"], "Bearer test-telemetry-code");
    assert.equal(call.options.headers.authorization, undefined);
    assert.deepEqual(JSON.parse(call.options.body).type, "click");
  });
});

test("analytics events use the same protected telemetry edge function", async () => {
  await withTelemetryCode(async () => {
    let payload;
    await recordAnalyticsEvent({ event: "page_view", capturedAt: "2026-09-15T20:00:00Z", piiStored: false }, {
      fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return response(); },
    });
    assert.equal(payload.type, "event");
    assert.equal(payload.event.event, "page_view");
  });
});

test("dashboard telemetry forwards internal and owner authorization separately", async () => {
  await withTelemetryCode(async () => {
    let headers;
    const result = await getDistributionTelemetry({
      ownerCode: "owner-test-code",
      fetchImpl: async (_url, options) => {
        headers = options.headers;
        return response({ ok: true, snapshot: { clicksLoaded: 3 } }, 200);
      },
    });
    assert.equal(headers["x-telemetry-authorization"], "Bearer test-telemetry-code");
    assert.equal(headers["x-owner-authorization"], "Bearer owner-test-code");
    assert.equal(result.clicksLoaded, 3);
  });
});

test("telemetry fails closed when existing BlindBoxAI authorization is missing", async () => {
  const previous = process.env.EVIDENCE_UPLOAD_CODE;
  delete process.env.EVIDENCE_UPLOAD_CODE;
  try {
    await assert.rejects(
      recordAnalyticsEvent({ event: "page_view", capturedAt: "2026-09-15T20:00:00Z" }, { fetchImpl: async () => response() }),
      /BlindBoxAI telemetry authorization is not configured/,
    );
  } finally {
    if (previous !== undefined) process.env.EVIDENCE_UPLOAD_CODE = previous;
  }
});
