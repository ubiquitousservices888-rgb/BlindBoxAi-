#!/usr/bin/env node

import assert from "node:assert/strict";

const origin = "https://blindboxai.com";
const expectedRevision = String(process.env.GITHUB_SHA || "").trim();
const maxAttempts = 9;

async function get(path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "BlindBoxAI-read-only-QA/1.0" },
  });
  assert.equal(response.status, 200, `${path}: expected HTTP 200, got ${response.status}`);
  return response;
}

async function verify() {
  const health = await get("/api/health");
  assert.match(health.headers.get("cache-control") || "", /no-store/);
  const body = await health.json();
  assert.equal(body.app, "blindboxai");
  assert.equal(body.status, "ok");
  if (!/^[0-9a-f]{40}$/.test(body.revision || "")) {
    throw new Error("Production revision is unavailable; deployment cannot be verified");
  }
  if (expectedRevision && body.revision !== expectedRevision) {
    throw new Error("Production revision does not match the checked-out main commit");
  }
  const page = await get("/series/labubu-the-monsters-have-a-seat");
  const html = await page.text();
  assert.match(html, /BlindBoxAI/);
  assert.match(html, /As an eBay Partner, BlindBoxAI may earn a commission/);
  console.log("QA_DEPLOYMENT_SMOKE: PASS");
  console.log("QA_APP_BOUNDARY: blindboxai");
  console.log("QA_PRODUCTION_REVISION: MATCH");
  console.log("QA_JOURNEY: series page and disclosure readable; no click, queue mutation, or publish");
}

let lastError;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    await verify();
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 20000));
  }
}
console.error(`QA_DEPLOYMENT_SMOKE: FAIL after ${maxAttempts} attempts`);
console.error(lastError instanceof Error ? lastError.message : "Unknown smoke error");
process.exitCode = 1;
