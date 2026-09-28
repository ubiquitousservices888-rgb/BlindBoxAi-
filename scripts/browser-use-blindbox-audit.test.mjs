import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectAffiliateUrl,
  maxRoutesFromPolicy,
  paidRunAllowed,
  resolveAffiliateHref,
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

  assert.throws(() => validatePolicy({ ...policy, auditScope: { ...policy.auditScope, discoverPrefixes: [] } }));
  assert.throws(() => validatePolicy({ ...policy, affiliateChecks: { ...policy.affiliateChecks, allowedOutboundHosts: [] } }));
  assert.throws(() => validatePolicy({ ...policy, affiliateChecks: { ...policy.affiliateChecks, requiredQueryParameters: [] } }));
});

test("paid Browser Use run requires explicit owner opt-in", () => {
  assert.equal(paidRunAllowed({}), false);
  assert.equal(paidRunAllowed({ BROWSER_USE_ALLOW_PAID_RUN: "false" }), false);
  assert.equal(paidRunAllowed({ BROWSER_USE_ALLOW_PAID_RUN: "true" }), true);
});

test("timeout and route caps are bounded, including valid boundaries", () => {
  assert.equal(timeoutFromEnv({}), 180000);
  assert.equal(timeoutFromEnv({ BROWSER_USE_TIMEOUT_MS: "30000" }), 30000);
  assert.equal(timeoutFromEnv({ BROWSER_USE_TIMEOUT_MS: "300000" }), 300000);
  assert.equal(maxRoutesFromPolicy(policy), 12);
  assert.equal(maxRoutesFromPolicy({ auditScope: { maxDiscoveredRoutes: 1 } }), 1);
  assert.equal(maxRoutesFromPolicy({ auditScope: { maxDiscoveredRoutes: 25 } }), 25);
  for (const raw of ["0", "-1", "300001", "NaN"]) {
    assert.throws(() => timeoutFromEnv({ BROWSER_USE_TIMEOUT_MS: raw }));
  }
  assert.throws(() => maxRoutesFromPolicy({ auditScope: { maxDiscoveredRoutes: 0 } }));
  assert.throws(() => maxRoutesFromPolicy({ auditScope: { maxDiscoveredRoutes: 26 } }));
});

test("affiliate URLs enforce HTTPS, required params, and preferred tracking reporting", () => {
  const good = inspectAffiliateUrl(
    "https://www.ebay.com/itm/123?campid=abc&toolid=10001&mkcid=1",
    policy,
  );
  assert.equal(good.valid, true);
  assert.deepEqual(good.missingRequired, []);
  assert.ok(good.missingPreferred.includes("mkevt"));
  assert.ok(good.missingPreferred.includes("mkrid"));
  assert.ok(good.missingPreferred.includes("customid"));

  const http = inspectAffiliateUrl(
    "http://www.ebay.com/itm/123?campid=abc&toolid=10001",
    policy,
  );
  assert.equal(http.valid, false);
  assert.equal(http.allowedHost, false);

  const bad = inspectAffiliateUrl(
    "https://evil.example/itm/123?campid=abc&toolid=10001",
    policy,
  );
  assert.equal(bad.valid, false);
  assert.equal(bad.allowedHost, false);

  const missing = inspectAffiliateUrl("https://www.ebay.com/itm/123?campid=abc", policy);
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missingRequired, ["toolid"]);
});

test("same-origin affiliate routes resolve by HEAD without opening the eBay target", async () => {
  let seenMethod = null;
  let seenRedirect = null;
  const fetchImpl = async (_url, options) => {
    seenMethod = options.method;
    seenRedirect = options.redirect;
    return new Response(null, {
      status: 302,
      headers: {
        location: "https://www.ebay.com/itm/123?campid=abc&toolid=10001&mkcid=1&mkevt=1&mkrid=711-53200-19255-0&customid=bb-test",
      },
    });
  };

  const result = await resolveAffiliateHref(
    "https://www.blindboxai.com/api/out/ebay?series=x&figure=y&kind=active&placement=series_table",
    policy,
    { fetchImpl, deadline: Date.now() + 5000 },
  );

  assert.equal(seenMethod, "HEAD");
  assert.equal(seenRedirect, "manual");
  assert.equal(result.resolution, "internal-head");
  assert.equal(result.valid, true);
  assert.equal(result.url.startsWith("https://www.ebay.com/"), true);
});

test("production affiliate HEAD validators are side-effect free", async () => {
  const classic = await fs.readFile(path.join(ROOT, "app", "api", "out", "ebay", "route.js"), "utf8");
  const live = await fs.readFile(path.join(ROOT, "app", "api", "out", "ebay-live", "route.js"), "utf8");

  for (const source of [classic, live]) {
    const start = source.indexOf("export async function HEAD");
    const end = source.indexOf("export async function GET", start);
    assert.ok(start >= 0 && end > start, "route must expose HEAD before GET");
    const block = source.slice(start, end);
    assert.doesNotMatch(block, /recordAffiliateClick/);
    assert.match(block, /status:\s*302/);
    assert.match(block, /Location:/);
  }
});
