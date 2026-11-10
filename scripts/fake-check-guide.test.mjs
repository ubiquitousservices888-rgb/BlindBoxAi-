import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

import {
  FAKE_CHECK_GUIDE,
  fakeCheckGuideOutboundPath,
  fakeCheckGuidePagePath,
  normalizeGuidePlacement,
} from "../lib/fake-check-guide.mjs";

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("the guide's checkout target is the fixed published Gumroad product", () => {
  assert.equal(FAKE_CHECK_GUIDE.checkoutUrl, "https://ubiquity6.gumroad.com/l/bjfpgf");
  assert.equal(FAKE_CHECK_GUIDE.priceUsd, 7);
  assert.equal(FAKE_CHECK_GUIDE.path, "/guides/fake-check-field-guide");
  assert.ok(Object.isFrozen(FAKE_CHECK_GUIDE));
});

test("buy links keep a tagged video visit and credit everyone else to the page", () => {
  assert.equal(fakeCheckGuideOutboundPath({}), "/api/out/guide?placement=guide_page");
  assert.equal(
    fakeCheckGuideOutboundPath({ campaignId: "bb-rv-3658d7e94a70b562", source: "youtube" }, "mew_guide"),
    "/api/out/guide?placement=mew_guide&campaign=bb-rv-3658d7e94a70b562&source=youtube",
  );
  // A template source or an unsafe campaign never claims attribution.
  assert.equal(fakeCheckGuideOutboundPath({ campaignId: "bb-rv-1", source: "page" }), "/api/out/guide?placement=guide_page");
  assert.equal(fakeCheckGuideOutboundPath({ campaignId: "x\"><script>", source: "youtube" }), "/api/out/guide?placement=guide_page");
  assert.equal(fakeCheckGuideOutboundPath({}, "https://evil.example"), "/api/out/guide?placement=unknown");
});

test("placements are an allow-list", () => {
  assert.equal(normalizeGuidePlacement("SERIES_FAKE_CHECK"), "series_fake_check");
  assert.equal(normalizeGuidePlacement("mew_guide"), "mew_guide");
  assert.equal(normalizeGuidePlacement("guide_page"), "guide_page");
  assert.equal(normalizeGuidePlacement("homepage"), "unknown");
  assert.equal(normalizeGuidePlacement(undefined), "unknown");
});

test("links to the sales page name their origin and carry a tagged visit", () => {
  assert.equal(fakeCheckGuidePagePath({}), "/guides/fake-check-field-guide");
  assert.equal(fakeCheckGuidePagePath({}, "series_fake_check"), "/guides/fake-check-field-guide?from=series_fake_check");
  assert.equal(
    fakeCheckGuidePagePath({ campaignId: "bb-rv-9c5d", source: "tiktok" }, "mew_guide"),
    "/guides/fake-check-field-guide?from=mew_guide&campaign=bb-rv-9c5d&source=tiktok",
  );
  assert.equal(fakeCheckGuidePagePath({}, "nowhere"), "/guides/fake-check-field-guide");
});

test("the sales page uses the listing copy, the disclaimer and the tracked buy link only", () => {
  const page = read("app/guides/fake-check-field-guide/page.jsx");
  assert.match(page, /fakeCheckGuideOutboundPath\(attribution, placement\)/);
  assert.match(page, /FAKE_CHECK_GUIDE\.disclaimer/);
  assert.match(page, /FAKE_CHECK_GUIDE\.inside\.map/);
  assert.doesNotMatch(page, /gumroad\.com/i, "checkout URL must only come from the lib constant via /api/out/guide");
  assert.doesNotMatch(page, /review|testimonial|sold \d|customers/i, "no invented social proof");
  for (const figure of ["teeth", "cardfront"]) {
    const svg = read(`public/guides/fake-check/${figure}.svg`);
    assert.match(svg, /Original BlindBoxAI drawing, not a photo/);
    assert.doesNotMatch(svg, /<script|xlink:href="http|href="http/i);
  }
});

test("series and Mew guide pages link to the sales page with their own origin", () => {
  assert.match(read("app/series/[slug]/page.jsx"), /<FakeCheckGuideBox attribution=\{attribution\} from="series_fake_check" \/>/);
  assert.match(read("app/guides/mew-ex-152-vs-158/page.jsx"), /<FakeCheckGuideBox attribution=\{attribution\} from="mew_guide" \/>/);
  assert.match(read("app/sitemap.js"), /\/guides\/fake-check-field-guide/);
  assert.match(read("app/_components/CoreAnalytics.jsx"), /\/api\/out\/guide"\)\) return "own_product"/);
});

test("/api/out/guide redirects only to the fixed checkout and logs a first-party event", async (t) => {
  const pending = [];
  const stub = `data:text/javascript,${encodeURIComponent(`
    export function after(fn) { globalThis.__guideAfter.push(fn); }
    export class NextResponse {
      static redirect(target, status = 307) { return new Response(null, { status, headers: { location: String(target) } }); }
      static json(body, { status = 200 } = {}) { return new Response(JSON.stringify(body), { status }); }
    }
  `)}`;
  globalThis.__guideAfter = pending;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/server") return { url: stub, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
  const prior = {
    url: process.env.SUPABASE_URL,
    code: process.env.EVIDENCE_UPLOAD_CODE,
    ingest: process.env.BLINDBOXAI_ALLOW_TEST_INGEST,
    fetch: globalThis.fetch,
  };
  const sent = [];
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.EVIDENCE_UPLOAD_CODE = "test-only-placeholder";
  process.env.BLINDBOXAI_ALLOW_TEST_INGEST = "true";
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true }), { status: 202 });
  };
  t.after(() => {
    hooks.deregister();
    globalThis.fetch = prior.fetch;
    for (const [key, name] of [["url", "SUPABASE_URL"], ["code", "EVIDENCE_UPLOAD_CODE"], ["ingest", "BLINDBOXAI_ALLOW_TEST_INGEST"]]) {
      if (prior[key] === undefined) delete process.env[name];
      else process.env[name] = prior[key];
    }
    delete globalThis.__guideAfter;
  });

  const { GET } = await import("../app/api/out/guide/route.js?fake-check-guide-test");
  const response = await GET(new Request(
    "https://www.blindboxai.com/api/out/guide?placement=mew_guide&campaign=bb-rv-3658d7e94a70b562&source=youtube&url=https://evil.example&to=https://evil.example",
    { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } },
  ));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://ubiquity6.gumroad.com/l/bjfpgf");

  assert.equal(pending.length, 1);
  await pending[0]();
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/functions\/v1\/distribution-telemetry$/);
  assert.equal(sent[0].body.type, "event");
  const event = sent[0].body.event;
  assert.equal(event.event, "own_product_checkout_click");
  assert.equal(event.destination, "gumroad");
  assert.equal(event.contentId, "fake-check-field-guide");
  assert.equal(event.campaign, "bb-rv-3658d7e94a70b562");
  assert.equal(event.source, "youtube");
  assert.equal(event.metadata.placement, "mew_guide");
  assert.equal(event.piiStored, false);
  assert.doesNotMatch(JSON.stringify(sent[0].body), /evil\.example|iPhone/);

  const bad = await GET(new Request("https://www.blindboxai.com/api/out/guide?placement=<x>"));
  assert.equal(bad.status, 302);
  assert.equal(bad.headers.get("location"), "https://ubiquity6.gumroad.com/l/bjfpgf");
  await pending[1]();
  assert.equal(sent[1].body.event.metadata.placement, "unknown");
  assert.equal(sent[1].body.event.campaign, null);
});

test("video UTM and stored campaign tags remain on the owned-product path", () => {
  const core = read("app/_components/CoreAnalytics.jsx");
  assert.match(core, /own_product_page/);
  assert.match(core, /destination !== "own_product_page"/);
  assert.match(core, /destination !== "own_product"/);
  const page = read("app/guides/fake-check-field-guide/page.jsx");
  assert.match(page, /query\?\.utm_campaign/);
  assert.match(page, /query\?\.utm_source/);
  const series = read("app/series/[slug]/page.jsx");
  assert.match(series, /query\?\.utm_campaign/);
  const mew = read("app/guides/mew-ex-152-vs-158/page.jsx");
  assert.match(mew, /query\?\.utm_source/);
});
