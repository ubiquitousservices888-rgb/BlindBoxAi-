import assert from "node:assert/strict";
import test from "node:test";
import { classifyAffiliateRequest } from "../lib/click-quality.mjs";

function request({ method = "GET", headers = {} } = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { method, headers: { get(name) { return normalized.get(String(name).toLowerCase()) || null; } } };
}

test("click classifier uses only coarse classes", () => {
  assert.deepEqual(classifyAffiliateRequest(request({ headers: { "user-agent": "Mozilla/5.0 Chrome/140 Safari/537.36" } })), {
    clientClass: "human_candidate",
    qualityReason: "default_candidate",
  });
  assert.deepEqual(classifyAffiliateRequest(request({ method: "HEAD", headers: { "user-agent": "Mozilla/5.0" } })), {
    clientClass: "head",
    qualityReason: "method_head",
  });
  assert.deepEqual(classifyAffiliateRequest(request({ headers: { "sec-purpose": "prefetch", "user-agent": "Mozilla/5.0" } })), {
    clientClass: "prefetch",
    qualityReason: "prefetch_header",
  });
  assert.deepEqual(classifyAffiliateRequest(request({ headers: { "user-agent": "Googlebot/2.1" } })), {
    clientClass: "bot",
    qualityReason: "bot_signature",
  });
  assert.deepEqual(classifyAffiliateRequest(request()), {
    clientClass: "bot",
    qualityReason: "missing_user_agent",
  });
});

test("classifier never returns raw headers or user-agent text", () => {
  const classified = classifyAffiliateRequest(request({ headers: { "user-agent": "secretly-unique-UA Mozilla/5.0" } }));
  assert.deepEqual(Object.keys(classified).sort(), ["clientClass", "qualityReason"]);
  assert.doesNotMatch(JSON.stringify(classified), /secretly-unique-UA/);
});
