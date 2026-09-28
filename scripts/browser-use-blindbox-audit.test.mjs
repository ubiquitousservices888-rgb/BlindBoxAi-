import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectAffiliateUrl,
  maxRoutesFromPolicy,
  paidRunAllowed,
  timeoutFromEnv,
  validatePolicy,
} from "./browser-use-blindbox-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(await fs.readFile(path.join(ROOT, "agents", "blindbox-agent-memory.json"), "utf8"));

test("policy locks canonical host, explicit owner gates, checks, and non-secret memory", () => {
  assert.equal(validatePolicy(policy), true);
  assert.equal(policy.site, "https://www.blindboxai.com");
  assert.equal(policy.defaultMode, "read_only");
  for (const gate of ["publish","delete","purchase","deploy","change_credentials","submit_external_forms","change_production_data"]) {
    assert.ok(policy.ownerApprovalRequired.includes(gate));
  }
  for (const item of ["api_keys","tokens","passwords","cookies","session_cookies","oauth_codes","environment_values"]) {
    assert.ok(policy.neverStore.includes(item));
  }
  assert.ok(policy.auditScope.routes.includes("/ask"));
  assert.ok(policy.auditScope.discoverPrefixes.includes("/series/"));
  assert.ok(policy.auditScope.discoverPrefixes.includes("/tools/buy-or-pass/"));
  assert.ok(policy.auditScope.discoverPrefixes.includes("/price/"));
  assert.ok(policy.auditScope.checks.length >= 6);
});

test("paid Browser Use run requires explicit owner opt-in", () => {
  assert.equal(paidRunAllowed({}), false);
  assert.equal(paidRunAllowed({ BROWSER_USE_ALLOW_PAID_RUN: "false" }), false);
  assert.equal(paidRunAllowed({ BROWSER_USE_ALLOW_PAID_RUN: "true" }), true);
});

test("timeout and route caps are bounded", () => {
  assert.equal(timeoutFromEnv({}), 180000);
  assert.equal(maxRoutesFromPolicy(policy), 12);
  for (const raw of ["0", "-1", "30001", "NaN"]) {
    assert.throws(() => timeoutFromEnv({ BROWSER_USE_TIMEOUT_MS: raw }));
  }
  assert.throws(() => maxRoutesFromPolicy({ auditScope: { maxDiscoveredRoutes: 0 } }));
  assert.throws(() => maxRoutesFromPolicy({ auditScope: { maxDiscoveredRoutes: 26 } }));
});

test("affiliate URLs are checked without requiring navigation", () => {
  const good = inspectAffiliateUrl("https://www.ebay.com/itm/123?campid=abc&toolid=10001&mkcid=1", policy);
  assert.equal(good.valid, true);
  assert.deepEqual(good.missingRequired, []);
  const bad = inspectAffiliateUrl("https://evil.example/itm/123?campid=abc&toolid=10001", policy);
  assert.equal(bad.valid, false);
  assert.equal(bad.allowedHost, false);
  const missing = inspectAffiliateUrl("https://www.ebay.com/itm/123?campid=abc", policy);
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missingRequired, ["toolid"]);
});
