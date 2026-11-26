import test from "node:test";
import assert from "node:assert/strict";
import { PRO_LIVE_PRICE, PRO_LIVE_PRODUCT, proStripeConfig, assertProOrigin, proCheckoutConfigured, proMissingSettings, proTestRuntime, readProBody, recordProFailure } from "../lib/pro-config.mjs";
import { requireProUser, assertProAuthResult } from "../lib/pro-auth.mjs";
import { createProStripe } from "../lib/pro-stripe.mjs";
import { normalizeProScenario, proScenariosCsv } from "../lib/pro-collection.mjs";

test("live billing requires explicit configuration and cannot choose another product", () => {
  const env = { PRO_STRIPE_MODE: "live", PRO_STRIPE_SECRET_KEY: "rk_live_fixture", PRO_APP_ORIGIN: "https://blindboxai.com" };
  assert.deepEqual([proStripeConfig(env).price, proStripeConfig(env).product], [PRO_LIVE_PRICE, PRO_LIVE_PRODUCT]);
  assert.throws(() => proStripeConfig(env, { checkout: true }), /checkout_unavailable/);
  assert.equal(proCheckoutConfigured(env), false);
  assert.throws(() => proStripeConfig({ ...env, PRO_STRIPE_PRICE_ID: "price_another_app" }), /configuration_unavailable/);
  assert.throws(() => proStripeConfig({ ...env, PRO_STRIPE_PRODUCT_ID: "prod_another_app" }), /configuration_unavailable/);
  for (const key of ["rk_live_", "rk_live_ bad", "sk_live_fixture", "sk_live_suffix\n", "rk_live_!invalid"]) assert.throws(() => proStripeConfig({ ...env, PRO_STRIPE_SECRET_KEY: key }), /configuration_unavailable/);
  assert.throws(() => proStripeConfig({ ...env, PRO_STRIPE_SECRET_KEY: "rk_test_fixture" }), /configuration_unavailable/);
  assert.throws(() => createProStripe({ ...env, PRO_STRIPE_API_ORIGIN: "https://attacker.example" }), /configuration_unavailable/);
  const enabled = { ...env, PRO_PAYMENTS_ENABLED: "true", PRO_SCHEMA_VERSION: "1", PRO_AUTH_EMAIL_READY: "true", PRO_STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture", PRO_STRIPE_WEBHOOK_ENDPOINT_ID: "we_fixture", PRO_STRIPE_WEBHOOK_SECRET: "whsec_fixture", PRO_TAX_CONFIGURATION: "manual-reviewed" };
  assert.throws(() => proStripeConfig(enabled, { checkout: true }), /checkout_unavailable/);
  assert.equal(proStripeConfig({ ...enabled, PRO_LIVE_BILLING_APPROVED: "true" }, { checkout: true }).live, true);
  const ready = { ...enabled, PRO_LIVE_BILLING_APPROVED: "true", SUPABASE_URL: "https://lazzdoadoqzrzlarerfx.supabase.co", SUPABASE_PUBLISHABLE_KEY: "local-publishable-fixture", SUPABASE_SERVICE_ROLE_KEY: "local-service-fixture" };
  assert.equal(proCheckoutConfigured(ready), true);
  assert.equal(proCheckoutConfigured({ ...ready, PRO_STRIPE_SECRET_KEY: "sk_live_fixture" }), false);
  assert.ok(proMissingSettings({ ...ready, PRO_STRIPE_SECRET_KEY: "sk_live_fixture" }).includes("PRO_STRIPE_SECRET_KEY"));
  assert.equal(proCheckoutConfigured({ ...ready, SUPABASE_URL: "https://other-project.supabase.co" }), false);
  assert.equal(proCheckoutConfigured({ ...ready, SUPABASE_URL: "" }), false);
  for (const name of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) assert.equal(proCheckoutConfigured({ ...ready, [name]: "   " }), false);
  assert.equal(proCheckoutConfigured({ ...ready, PRO_STRIPE_WEBHOOK_SECRET: "malformed" }), false);
  assert.throws(() => proStripeConfig({ ...ready, PRO_STRIPE_WEBHOOK_SECRET: "malformed" }, { checkout: true }), /checkout_unavailable/);
  assert.ok(proMissingSettings({ ...ready, PRO_PAYMENTS_ENABLED: "false" }).includes("PRO_PAYMENTS_ENABLED"));
  assert.ok(proMissingSettings({ ...ready, PRO_LIVE_BILLING_APPROVED: "false" }).includes("PRO_LIVE_BILLING_APPROVED"));
  assert.ok(proMissingSettings({ ...ready, PRO_STRIPE_MODE: "test", PRO_STRIPE_PRICE_ID: "" }).includes("PRO_STRIPE_PRICE_ID"));
});

test("provider outages remain unavailable rather than invalid credentials, and logs redact error content", async () => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email_confirmed_at: "2026-01-01" };
  const auth = error => ({ client: { auth: { getUser: async () => ({ data: { user }, error }) } } });
  await assert.rejects(requireProUser(auth({ status: 503, name: "AuthApiError" })), error => error.status === 503 && error.code === "auth_provider_unavailable");
  await assert.rejects(requireProUser(auth({ name: "AuthRetryableFetchError" })), error => error.status === 503 && error.code === "auth_provider_unavailable");
  await assert.rejects(requireProUser(auth({ status: 401, name: "AuthApiError" })), error => error.status === 401 && error.code === "sign_in_required");
  assert.throws(() => assertProAuthResult({ status: 503 }, "invalid_credentials"), error => error.status === 503 && error.code === "auth_provider_unavailable");
  assert.throws(() => assertProAuthResult({ status: 400 }, "invalid_credentials"), error => error.status === 401 && error.code === "invalid_credentials");
  assert.throws(() => assertProAuthResult({ status: 429 }, "invalid_credentials"), error => error.status === 429 && error.code === "try_again_later");
  const logs = [], before = console.error;
  try {
    console.error = (...values) => logs.push(JSON.stringify(values));
    recordProFailure(Object.assign(new Error("private-token-in-provider-url"), { name: "private-token-in-provider-name" }), "checkout");
  } finally { console.error = before; }
  assert.match(logs.join(""), /unexpected_error/); assert.doesNotMatch(logs.join(""), /private-token/);
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
  for (const contentType of ["application/jsonp", "application/json-extra", "text/plain"]) {
    await assert.rejects(readProBody(new Request("https://blindboxai.com/api/pro/checkout", {
      method: "POST", headers: { "Content-Type": contentType }, body: "{}",
    })), /invalid_request/);
  }
  for (const contentType of ["application/json; charset=utf-8", "Application/JSON"]) {
    assert.deepEqual(await readProBody(new Request("https://blindboxai.com/api/pro/checkout", {
      method: "POST", headers: { "Content-Type": contentType }, body: "{}",
    })), {});
  }
});

test("isolated loopback Stripe HTTP uses port 80 when no port is specified", () => {
  const stripe = createProStripe({ NODE_ENV: "test", BLINDBOXAI_ALLOW_TEST_INGEST: "true", PRO_STRIPE_MODE: "test", PRO_STRIPE_SECRET_KEY: "rk_test_fixture", PRO_STRIPE_PRICE_ID: "price_fixture", PRO_STRIPE_PRODUCT_ID: "prod_fixture", PRO_STRIPE_API_ORIGIN: "http://127.0.0.1/" });
  assert.equal(stripe.getApiField("port"), 80);
});

test("an injected environment alone controls Pro test runtime and Stripe loopback", () => {
  const env = { BLINDBOXAI_ALLOW_TEST_INGEST: "true", PRO_STRIPE_MODE: "test", PRO_STRIPE_SECRET_KEY: "sk_test_fixture", PRO_STRIPE_PRICE_ID: "price_fixture", PRO_STRIPE_PRODUCT_ID: "prod_fixture", PRO_STRIPE_API_ORIGIN: "http://127.0.0.1/" };
  assert.equal(proTestRuntime(env), false);
  assert.throws(() => createProStripe(env), /configuration_unavailable/);
  const testEnv = { ...env, NODE_TEST_CONTEXT: "child-v8" };
  assert.equal(proTestRuntime(testEnv), true);
  assert.equal(createProStripe(testEnv).getApiField("host"), "127.0.0.1");
});

test("CSV guards formula injection while preserving numeric loss amounts", () => {
  const row = { id: "33333333-3333-4333-8333-333333333333", name: " =1+1", quantity: 1, inputs: { purchase: 20, inboundShipping: 0, salesTax: 0, salePrice: 10, feePercent: 0, outboundShipping: 0, desiredProfit: 0 } };
  const normalized = normalizeProScenario(row);
  assert.equal(normalized.name, "=1+1");
  const csv = proScenariosCsv([row]);
  assert.match(csv, /"'=1\+1"/); assert.match(csv, /,-10,-10,/);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.throws(() => normalizeProScenario({ ...row, id: [row.id] }), error => error.status === 400);
});
