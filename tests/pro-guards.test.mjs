import test from "node:test";
import assert from "node:assert/strict";
import { PRO_LIVE_PRICE, PRO_LIVE_PRODUCT, proStripeConfig, assertProOrigin, proCheckoutAvailable, readProBody } from "../lib/pro-config.mjs";
import { createProStripe } from "../lib/pro-stripe.mjs";
import { normalizeProScenario, proScenariosCsv } from "../lib/pro-collection.mjs";

test("live billing requires explicit configuration and cannot choose another product", () => {
  const env = { PRO_STRIPE_MODE: "live", PRO_STRIPE_SECRET_KEY: "rk_live_fixture", PRO_APP_ORIGIN: "https://blindboxai.com" };
  assert.deepEqual([proStripeConfig(env).price, proStripeConfig(env).product], [PRO_LIVE_PRICE, PRO_LIVE_PRODUCT]);
  assert.throws(() => proStripeConfig(env, { checkout: true }), /checkout_unavailable/);
  assert.equal(proCheckoutAvailable(env), false);
  assert.throws(() => proStripeConfig({ ...env, PRO_STRIPE_PRICE_ID: "price_another_app" }), /configuration_unavailable/);
  assert.throws(() => proStripeConfig({ ...env, PRO_STRIPE_SECRET_KEY: "rk_test_fixture" }), /configuration_unavailable/);
  assert.throws(() => createProStripe({ ...env, PRO_STRIPE_API_ORIGIN: "https://attacker.example" }), /configuration_unavailable/);
  const enabled = { ...env, PRO_PAYMENTS_ENABLED: "true", PRO_SCHEMA_VERSION: "1", PRO_AUTH_EMAIL_READY: "true", PRO_STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture", PRO_STRIPE_WEBHOOK_ENDPOINT_ID: "we_fixture", PRO_STRIPE_WEBHOOK_SECRET: "whsec_fixture", PRO_TAX_CONFIGURATION: "manual-reviewed" };
  assert.throws(() => proStripeConfig(enabled, { checkout: true }), /checkout_unavailable/);
  assert.equal(proStripeConfig({ ...enabled, PRO_LIVE_BILLING_APPROVED: "true" }, { checkout: true }).live, true);
});

test("cross-origin requests and unbounded or malformed bodies are rejected", async () => {
  const env = { PRO_APP_ORIGIN: "https://blindboxai.com" };
  assertProOrigin(new Request("https://blindboxai.com/api/pro/checkout", { headers: { Origin: "https://www.blindboxai.com" } }), env);
  for (const origin of ["https://attacker.example", "null", "https://blindboxai.com.attacker.example"]) assert.throws(() => assertProOrigin(new Request("https://blindboxai.com/api/pro/checkout", { headers: { Origin: origin } }), env), /invalid_origin/);
  const request = body => new Request("https://blindboxai.com/api/pro/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  await assert.rejects(readProBody(request("x".repeat(100)), 10), /request_too_large/);
  await assert.rejects(readProBody(request("[]")), /invalid_request/);
  await assert.rejects(readProBody(request("null")), /invalid_request/);
  assert.deepEqual(await readProBody(request("{}")), {});
});

test("CSV guards formula injection while preserving numeric loss amounts", () => {
  const row = { id: "33333333-3333-4333-8333-333333333333", name: " =1+1", quantity: 1, inputs: { purchase: 20, inboundShipping: 0, salesTax: 0, salePrice: 10, feePercent: 0, outboundShipping: 0, desiredProfit: 0 } };
  const normalized = normalizeProScenario(row);
  assert.equal(normalized.name, "=1+1");
  const csv = proScenariosCsv([row]);
  assert.match(csv, /"'=1\+1"/); assert.match(csv, /,-10,-10,/);
});
