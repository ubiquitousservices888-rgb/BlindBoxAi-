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

test("affiliate resolver covers direct, unrelated, failed, and live-link paths", async () => {
  const direct = await resolveAffiliateHref(
    "https://www.ebay.com/itm/123?campid=1234567&toolid=10001&mkcid=1&mkevt=1&mkrid=711-53200-19255-0&customid=bb-test",
    policy,
  );
  assert.equal(direct.resolution, "direct");
  assert.equal(direct.valid, true);

  const unrelated = await resolveAffiliateHref(
    "https://www.blindboxai.com/ask",
    policy,
  );
  assert.equal(unrelated, null);

  const failed = await resolveAffiliateHref(
    "https://www.blindboxai.com/api/out/ebay?series=x&figure=y&kind=active&placement=series_table",
    policy,
    {
      fetchImpl: async () => new Response(null, { status: 404 }),
      deadline: Date.now() + 5000,
    },
  );
  assert.equal(failed.valid, false);
  assert.equal(failed.reason, "validation-http-404");

  let liveFetchCalls = 0;
  const live = await resolveAffiliateHref(
    "https://www.blindboxai.com/api/out/ebay-live?item=v1%7C123%7C0&context=ask&id=visual-search",
    policy,
    {
      fetchImpl: async () => {
        liveFetchCalls += 1;
        throw new Error("live link validation must not call upstream");
      },
      deadline: Date.now() + 5000,
    },
  );
  assert.equal(liveFetchCalls, 0);
  assert.equal(live.resolution, "internal-live-structure");
  assert.equal(live.valid, true);
  assert.equal(live.targetHostVerifiedBy, "normalizeEbayBrowseItem");

  const badLive = await resolveAffiliateHref(
    "https://www.blindboxai.com/api/out/ebay-live?context=ask&id=visual-search",
    policy,
  );
  assert.equal(badLive.valid, false);
  assert.equal(badLive.reason, "invalid-live-route-parameters");
  assert.ok(badLive.missingRequired.includes("item"));
});

test("invalid resolved affiliate targets always carry a triage reason", async () => {
  const result = await resolveAffiliateHref(
    "https://www.blindboxai.com/api/out/ebay?series=x&figure=y&kind=active&placement=series_table",
    policy,
    {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/itm/123?campid=1234567&toolid=10001" },
      }),
      deadline: Date.now() + 5000,
    },
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, "disallowed-host-or-protocol");
});

test("audit source persists timeout state instead of throwing away partial results", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts", "browser-use-blindbox-audit.mjs"), "utf8");
  assert.match(source, /let timedOut = false;/);
  assert.match(source, /if \(Date\.now\(\) >= deadline\) \{\s*timedOut = true;\s*break;/s);
  assert.match(source, /timedOut,/);
  assert.match(source, /remainingQueuedRoutes: queue\.length/);
  assert.match(source, /report\.summary\.timedOut === false/);
});

test("classic affiliate HEAD returns one verified eBay redirect without click telemetry", async () => {
  const priorCampId = process.env.NEXT_PUBLIC_EPN_CAMPID;
  process.env.NEXT_PUBLIC_EPN_CAMPID = "1234567";
  try {
    const [{ HEAD }, { allSeries }] = await Promise.all([
      import("../app/api/out/ebay/route.js?browser-audit-head-test"),
      import("../lib/data.js"),
    ]);
    const series = allSeries().find((entry) => Array.isArray(entry.figures) && entry.figures.length > 0);
    assert.ok(series, "expected at least one series fixture");
    const figure = series.figures[0];
    const url = new URL("https://www.blindboxai.com/api/out/ebay");
    url.searchParams.set("series", series.slug);
    url.searchParams.set("figure", figure.name);
    url.searchParams.set("kind", "active");
    url.searchParams.set("placement", "series_table");
    url.searchParams.set("itemSlug", figure.name);

    const response = await HEAD(new Request(url));
    assert.equal(response.status, 302);
    const location = response.headers.get("location");
    assert.ok(location, "HEAD must return Location with its 302");
    const target = new URL(location);
    assert.equal(target.protocol, "https:");
    assert.ok(target.hostname === "ebay.com" || target.hostname.endsWith(".ebay.com"));
    assert.equal(target.searchParams.get("campid"), "1234567");
    assert.equal(target.searchParams.get("toolid"), "10001");

    const source = await fs.readFile(path.join(ROOT, "app", "api", "out", "ebay", "route.js"), "utf8");
    const start = source.indexOf("export async function HEAD");
    const end = source.indexOf("export async function GET", start);
    assert.doesNotMatch(source.slice(start, end), /recordAffiliateClick/);
  } finally {
    if (priorCampId === undefined) delete process.env.NEXT_PUBLIC_EPN_CAMPID;
    else process.env.NEXT_PUBLIC_EPN_CAMPID = priorCampId;
  }
});

test("live eBay route does not expose a quota-consuming HEAD validator and sanitizes provider targets", async () => {
  const source = await fs.readFile(path.join(ROOT, "app", "api", "out", "ebay-live", "route.js"), "utf8");
  assert.doesNotMatch(source, /export async function HEAD/);
  assert.match(source, /getEbayProductionItem/);
  assert.match(source, /NextResponse\.redirect\(item\.affiliateUrl, 302\)/);

  const { normalizeEbayBrowseItem } = await import("../lib/ebay-production-api.mjs");
  assert.equal(normalizeEbayBrowseItem({
    itemId: "v1|123|0",
    title: "Example",
    itemAffiliateWebUrl: "https://evil.example/itm/123",
  }), null);
  const safe = normalizeEbayBrowseItem({
    itemId: "v1|123|0",
    title: "Example",
    itemAffiliateWebUrl: "https://www.ebay.com/itm/123",
  });
  assert.equal(safe.affiliateUrl, "https://www.ebay.com/itm/123");
});
