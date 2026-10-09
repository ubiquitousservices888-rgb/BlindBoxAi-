#!/usr/bin/env node
// Safe read-only hosted smoke: never call /api/out/*, Buffer or affiliate providers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { reviewVideoLandingUrl } from "../lib/review-landing-url.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";

const item = {
  title: "THE MONSTERS Hair Salon Series — Vinyl Plush Pendant Blind Box",
  video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/sha256-7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0.mp4",
  research_run_id: "rv-3c9c9bb78c37ff6a",
};
const expectedDigest = "7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0";
const expectedBytes = 121797;

async function publicGet(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: { "User-Agent": "BlindBoxAI-read-only-video-verification/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `${new URL(url).pathname}: public HTTP 200 required`);
  return response;
}

async function verifyMedia() {
  const response = await publicGet(item.video_url);
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
  const response = await publicGet(url);
  const final = new URL(response.url);
  assert.ok(["blindboxai.com", "www.blindboxai.com"].includes(final.hostname));
  assert.equal(final.pathname.replace(/\/$/, ""), "/series/labubu-the-monsters-hair-salon");
  assert.equal(final.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
  assert.equal(final.searchParams.get("source"), service);
  assert.match(response.headers.get("content-type") || "", /text\/html/i);
  const html = await response.text();
  assert.match(html, /Hair Salon/);
  assert.match(html, /As an eBay Partner, BlindBoxAI may earn a commission/);
  console.log(`HAIR_SALON_LANDING: VERIFIED_HTTP_200:${service}`);
}

await verifyMedia();
for (const service of ["youtube", "tiktok"]) await verifyLanding(service);
console.log("HAIR_SALON_PUBLIC_URLS: PASS (read-only, no affiliate clicks or publication)");
