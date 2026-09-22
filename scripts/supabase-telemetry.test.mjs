import assert from "node:assert/strict";
import test from "node:test";

import {
  getDistributionTelemetry,
  recordAffiliateClick,
  recordAnalyticsEvent,
  recordProviderEvidence,
} from "../lib/supabase-telemetry.mjs";

async function withTelemetryTestConfig(fn) {
  const previous = {
    code: process.env.EVIDENCE_UPLOAD_CODE,
    url: process.env.SUPABASE_URL,
    allow: process.env.BLINDBOXAI_ALLOW_TEST_INGEST,
  };
  process.env.EVIDENCE_UPLOAD_CODE = "test-telemetry-code";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.BLINDBOXAI_ALLOW_TEST_INGEST = "true";
  try { await fn(); } finally {
    if (previous.code === undefined) delete process.env.EVIDENCE_UPLOAD_CODE;
    else process.env.EVIDENCE_UPLOAD_CODE = previous.code;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.allow === undefined) delete process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
    else process.env.BLINDBOXAI_ALLOW_TEST_INGEST = previous.allow;
  }
}

function response(body = { ok: true }, status = 202) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("affiliate clicks use the Supabase telemetry edge function with existing BlindBoxAI auth", async () => {
  await withTelemetryTestConfig(async () => {
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
  await withTelemetryTestConfig(async () => {
    let payload;
    await recordAnalyticsEvent({ event: "page_view", capturedAt: "2026-09-15T20:00:00Z", piiStored: false }, {
      fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return response(); },
    });
    assert.equal(payload.type, "event");
    assert.equal(payload.event.event, "page_view");
  });
});

test("dashboard telemetry forwards internal and owner authorization separately", async () => {
  await withTelemetryTestConfig(async () => {
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

test("telemetry writes make zero network calls in automated tests without explicit opt-in", async () => {
  const previousAllow = process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
  delete process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
  let calls = 0;
  try {
    const result = await recordAnalyticsEvent(
      { event: "page_view", capturedAt: "2026-09-15T20:00:00Z" },
      { fetchImpl: async () => { calls += 1; return response(); } },
    );
    assert.equal(calls, 0);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "test_recording_disabled");
  } finally {
    if (previousAllow !== undefined) process.env.BLINDBOXAI_ALLOW_TEST_INGEST = previousAllow;
  }
});

test("telemetry fails closed when existing BlindBoxAI authorization is missing", async () => {
  await withTelemetryTestConfig(async () => {
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
});


test("provider evidence writer requires owner authorization and sends no raw CSV", async () => {
  await withTelemetryTestConfig(async () => {
    let call;
    await recordProviderEvidence([
      { providerEvidenceId: "txn-1", customId: "bb-test", occurredAt: "2026-09-20T00:00:00Z", confirmedRevenueUSD: 2.5 },
    ], {
      ownerCode: "owner-test-code",
      fetchImpl: async (url, options) => {
        call = { url: String(url), options, payload: JSON.parse(options.body) };
        return response({ ok: true, inserted: 1, duplicates: 0 }, 202);
      },
    });
    assert.equal(call.payload.type, "provider_evidence");
    assert.equal(call.options.headers["x-owner-authorization"], "Bearer owner-test-code");
    assert.equal(call.payload.evidence[0].providerEvidenceId, "txn-1");
    assert.equal("csv" in call.payload, false);
  });
});
