#!/usr/bin/env node
// Safe read-only hosted smoke: never call /api/out/*, Buffer or affiliate providers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { reviewVideoLandingUrl } from "../lib/review-landing-url.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";
import { fetchApprovedPublicUrl } from "../lib/read-only-url-fetch.mjs";
import { HAIR_SALON_TITLE, HAIR_SALON_MEDIA_URL, HAIR_SALON_SHA256, HAIR_SALON_SIZE } from "../lib/hair-salon-asset.mjs";

const item = {
  title: HAIR_SALON_TITLE,
  video_url: HAIR_SALON_MEDIA_URL,
  research_run_id: "rv-3c9c9bb78c37ff6a",
};
const expectedDigest = HAIR_SALON_SHA256;
const expectedBytes = HAIR_SALON_SIZE;

function allowedMediaUrl(candidate) {
  return candidate.toString() === item.video_url;
}

function allowedLandingUrl(candidate, service) {
  return candidate.protocol === "https:" &&
    candidate.port === "" &&
    ["blindboxai.com", "www.blindboxai.com"].includes(candidate.hostname) &&
    candidate.pathname.replace(/\/$/, "") === "/series/labubu-the-monsters-hair-salon" &&
    candidate.searchParams.get("campaign") === "bb-rv-3c9c9bb78c37ff6a" &&
    candidate.searchParams.get("source") === service;
}

async function verifyMedia() {
  const { response } = await fetchApprovedPublicUrl(item.video_url, { allowUrl: allowedMediaUrl });
  assert.match(response.headers.get("content-type") || "", /^video\/mp4\b/i);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.byteLength;
    assert.ok(total <= expectedBytes, "Public MP4 exceeds pinned byte size");
    chunks.push(Buffer.from(chunk));
  }
  assert.equal(total, expectedBytes, "Public MP4 size drift");
  const digest = createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
  assert.equal(digest, expectedDigest, "Public MP4 SHA-256 drift");
  console.log("HAIR_SALON_MEDIA: VERIFIED_200_SHA256_SIZE");
}

async function verifyLanding(service) {
  const url = buildTrackedSocialCta(reviewVideoLandingUrl(item), {
    runId: item.research_run_id, service,
  });
  const { response, finalUrl } = await fetchApprovedPublicUrl(url, {
    allowUrl: (candidate) => allowedLandingUrl(candidate, service),
  });
  const final = new URL(finalUrl);
  assert.ok(["blindboxai.com", "www.blindboxai.com"].includes(final.hostname));
  assert.equal(final.pathname.replace(/\/$/, ""), "/series/labubu-the-monsters-hair-salon");
  assert.equal(final.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
  assert.equal(final.searchParams.get("source"), service);
  assert.match(response.headers.get("content-type") || "", /text\/html/i);
  const html = await response.text();
  assert.match(html, /Hair Salon/);
  assert.match(html, /As an eBay Partner, BlindBoxAI may earn a commission/);
  // Parse server-rendered first-party redirect without requesting it: test
  // affiliate campaign retention without recording fake/automated clicks.
  const outboundHref = html.match(/href="([^"]*\/api\/out\/ebay\?[^"]+)"/)?.[1];
  assert.ok(outboundHref, "The Hair Salon landing must expose an internal eBay affiliate CTA");
  const outbound = new URL(outboundHref.replaceAll("&amp;", "&"), final);
  assert.equal(outbound.origin, final.origin);
  assert.equal(outbound.pathname, "/api/out/ebay");
  assert.equal(outbound.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
  assert.equal(outbound.searchParams.get("source"), service);
  console.log(`HAIR_SALON_LANDING_AND_EPN_LINK: VERIFIED_HTTP_200:${service}`);
}

await verifyMedia();
for (const service of ["youtube", "tiktok"]) await verifyLanding(service);
console.log("HAIR_SALON_PUBLIC_URLS: PASS (read-only, no affiliate clicks or publication)");
