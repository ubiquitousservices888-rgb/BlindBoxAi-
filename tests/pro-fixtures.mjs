import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createProStore } from "../lib/pro-store.mjs";
import { createProStripe, PRO_STRIPE_API_VERSION } from "../lib/pro-stripe.mjs";
import { PRO_EVENTS, PRO_INTEGRATION } from "../lib/pro-config.mjs";
import { PRO_UUID } from "../lib/pro-collection.mjs";

export const USER_A = "11111111-1111-4111-8111-111111111111";
export const USER_B = "22222222-2222-4222-8222-222222222222";
export const INPUTS = { purchase: 10, inboundShipping: 2, salesTax: 1, salePrice: 30, feePercent: 10, outboundShipping: 4, desiredProfit: 3 };
const RPC = {
  pro_schema_version: [], pro_take_rate_limit: ["p_key", "p_limit", "p_seconds"],
  pro_claim_checkout: ["p_user_id", "p_livemode"], pro_bind_customer: ["p_user_id", "p_livemode", "p_customer_id"],
  pro_save_checkout: ["p_user_id", "p_livemode", "p_attempt_id", "p_session_id", "p_expires_at"],
  pro_apply_stripe_event: ["p_event_id", "p_event_type", "p_event_created", "p_livemode", "p_user_id", "p_customer_id", "p_subscription", "p_risk_hold", "p_clear_checkout"],
  pro_save_scenario: ["p_user_id", "p_id", "p_name", "p_inputs", "p_quantity"],
};

export async function proFixtures() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);");
  await db.query("insert into auth.users(id) values ($1),($2)", [USER_A, USER_B]);
  await db.exec(await readFile(new URL("../supabase/migrations/20261116042308_reseller_pro_stripe_pipeline.sql", import.meta.url), "utf8"));
  const serviceQuery = (query, args = []) => db.transaction(async tx => {
    await tx.exec("set local role service_role");
    return tx.query(query, args);
  });
  const state = { customers: new Map(), sessions: new Map(), subscriptions: new Map(), invoices: new Map(), charges: new Map(), idempotency: new Map(), customerCreates: 0, checkoutCreates: 0, requests: [], writes: 0, priceValid: true, deliveryValid: true, portalIntegration: "blindboxai_pro_v1", schemaDown: false };
  state.scenarioDeleteDown = false;
  const env = {
    NODE_ENV: "test", CI: "true", BLINDBOXAI_ALLOW_TEST_INGEST: "true", PRO_APP_ORIGIN: "http://127.0.0.1:3376",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-fixture", SUPABASE_PUBLISHABLE_KEY: "local-publishable-fixture",
    PRO_STRIPE_MODE: "test", PRO_STRIPE_SECRET_KEY: "rk_test_fixture", PRO_STRIPE_WEBHOOK_SECRET: "whsec_local_fixture",
    PRO_STRIPE_PRICE_ID: "price_pro_fixture", PRO_STRIPE_PRODUCT_ID: "prod_pro_fixture", PRO_STRIPE_PORTAL_CONFIGURATION_ID: "bpc_pro_fixture",
    PRO_STRIPE_WEBHOOK_ENDPOINT_ID: "we_pro_fixture", PRO_PAYMENTS_ENABLED: "true", PRO_SCHEMA_VERSION: "1", PRO_AUTH_EMAIL_READY: "true", PRO_TAX_CONFIGURATION: "manual-reviewed",
    OWNER_CONTROL_CODE: "local-owner-fixture",
  };
  const providerIds = { price: env.PRO_STRIPE_PRICE_ID, product: env.PRO_STRIPE_PRODUCT_ID, webhook: env.PRO_STRIPE_WEBHOOK_ENDPOINT_ID, portal: env.PRO_STRIPE_PORTAL_CONFIGURATION_ID };
  const users = new Map([[USER_A, { id: USER_A, email: "one@example.test", role: "authenticated", aud: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false }], [USER_B, { id: USER_B, email: "two@example.test", role: "authenticated", aud: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false }]]);
  function token(user) { return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, session_id: randomUUID() })).toString('base64url')}.fixture`; }
  const sessions = new Map();
  function authSession(user) {
    const access = token(user); sessions.set(access, user);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "local-refresh-fixture", user };
  }
  const price = () => ({ id: providerIds.price, object: "price", active: true, livemode: false, currency: "usd", unit_amount: state.priceValid ? 999 : 2900, product: { id: providerIds.product, object: "product", active: true }, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive" });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      const json = () => raw ? JSON.parse(raw) : {};
      const form = new URLSearchParams(raw);
      function reply(value, status = 200) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); }
      if (url.pathname.startsWith("/rest/v1/")) {
        if (req.headers.apikey !== env.SUPABASE_SERVICE_ROLE_KEY || req.headers.authorization !== `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) return reply({ error: "unauthorized" }, 401);
        const path = url.pathname.slice("/rest/v1/".length);
        if (req.method === "DELETE") {
          const params = url.searchParams;
          const user = params.get("user_id");
          const id = params.get("id");
          if (path !== "pro_scenarios" || raw || params.size !== 3 ||
              req.headers.prefer !== "return=representation" || params.get("select") !== "id" ||
              !user?.startsWith("eq.") || !PRO_UUID.test(user.slice(3)) ||
              !id?.startsWith("eq.") || !PRO_UUID.test(id.slice(3))) {
            throw new Error("Unsupported fixture DELETE request");
          }
          if (state.scenarioDeleteDown) return reply({ error: "fixture_storage_unavailable" }, 503);
          const deleted = await serviceQuery(
            "delete from public.pro_scenarios where user_id=$1 and id=$2 returning id",
            [user.slice(3), id.slice(3)],
          );
          return reply(deleted.rows);
        }
        if (path.startsWith("rpc/")) {
          const name = path.slice(4), keys = RPC[name];
          if (!keys) return reply({ error: "missing_rpc" }, 404);
          if (name === "pro_schema_version" && state.schemaDown) return reply({ error: "unavailable" }, 503);
          const body = json();
          const args = keys.map(k => k === "p_inputs" || k === "p_subscription" ? body[k] == null ? null : JSON.stringify(body[k]) : body[k]);
          const query = `select public.${name}(${keys.map((k, i) => `$${i + 1}${["p_inputs", "p_subscription"].includes(k) ? "::jsonb" : ""}`).join(",")}) as value`;
          return reply((await serviceQuery(query, args)).rows[0].value);
        }
        if (!["pro_accounts", "pro_subscriptions", "pro_scenarios"].includes(path)) return reply({ error: "missing_table" }, 404);
        const values = [], clauses = [];
        for (const key of ["user_id", "livemode", "stripe_customer_id", "id"]) if (url.searchParams.has(key)) {
          const filter = url.searchParams.get(key);
          if (!filter.startsWith("eq.")) return reply({ error: "filter" }, 400);
          values.push(filter.slice(3)); clauses.push(`${key}=$${values.length}`);
        }
        const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
        const limit = Math.min(250, Number(url.searchParams.get("limit") || "250"));
        const statusFilter = path === "pro_subscriptions" && url.searchParams.get("status") === "not.in.(canceled,incomplete_expired)" ? `${where ? " and " : " where "}status not in ('canceled','incomplete_expired')` : "";
        return reply((await serviceQuery(`select * from public.${path}${where}${statusFilter}${path === "pro_scenarios" ? " order by created_at desc" : ""} limit ${limit}`, values)).rows);
      }
      if (url.pathname.startsWith("/auth/v1/")) {
        if (req.headers.apikey !== env.SUPABASE_PUBLISHABLE_KEY) return reply({ message: "invalid key" }, 401);
        if (state.authFailure?.path === url.pathname && (!state.authFailure.method || state.authFailure.method === req.method)) return reply({ msg: "Fixture auth failure" }, state.authFailure.status);
        if (url.pathname === "/auth/v1/token") {
          const body = json(); const user = [...users.values()].find(u => u.email === body.email);
          if (!user || body.password !== "local-test-password") return reply({ msg: "Invalid login credentials" }, 400);
          return reply(authSession(user));
        }
        const current = sessions.get(String(req.headers.authorization || "").replace("Bearer ", ""));
        if (url.pathname === "/auth/v1/user") return current ? reply(current) : reply({ message: "invalid token" }, 401);
        if (url.pathname === "/auth/v1/logout") return reply({});
        if (url.pathname === "/auth/v1/signup" || url.pathname === "/auth/v1/recover") return reply({});
      }
      if (!url.pathname.startsWith("/v1/")) return reply({ error: "missing" }, 404);
      if (req.headers.authorization !== `Bearer ${env.PRO_STRIPE_SECRET_KEY}`) return reply({ error: { message: "Invalid API key", type: "authentication_error" } }, 401);
      if (state.providerGate) await state.providerGate;
      state.requests.push({ path: url.pathname, method: req.method, params: Object.fromEntries(form), query: Object.fromEntries(url.searchParams), stripeVersion: req.headers["stripe-version"] });
      if (req.method === "POST") state.writes++;
      const key = req.headers["idempotency-key"];
      if (key && state.idempotency.has(key)) {
        const saved = state.idempotency.get(key);
        if (saved.raw !== raw) return reply({ error: { type: "idempotency_error", message: "parameters changed" } }, 400);
        return reply(saved.value);
      }
      const finish = value => { if (key) state.idempotency.set(key, { raw, value }); reply(value); };
      const missing = () => reply({ error: { type: "invalid_request_error", code: "resource_missing", message: "No such fixture resource" } }, 404);
      const mapped = map => { const value = map.get(url.pathname.split("/").pop()); return value ? reply(value) : missing(); };
      const invoiceResponse = (invoice, field) => {
        if (!invoice || typeof invoice === "string" || [...url.searchParams.values()].includes(field)) return invoice;
        const { amount_paid_off_stripe, ...defaultInvoice } = invoice;
        return defaultInvoice;
      };
      if (url.pathname.startsWith("/v1/prices/")) return url.pathname.split("/").pop() === providerIds.price ? reply(price()) : missing();
      if (url.pathname.startsWith("/v1/webhook_endpoints/")) return url.pathname.split("/").pop() === providerIds.webhook ? reply({ id: providerIds.webhook, status: state.deliveryValid ? "enabled" : "disabled", livemode: false, url: `${env.PRO_APP_ORIGIN}/api/pro/webhook`, api_version: PRO_STRIPE_API_VERSION, enabled_events: PRO_EVENTS, metadata: { integration: PRO_INTEGRATION } }) : missing();
      if (url.pathname.startsWith("/v1/billing_portal/configurations/")) return url.pathname.split("/").pop() === providerIds.portal ? reply({ id: providerIds.portal, active: true, livemode: false, metadata: { integration: state.portalIntegration }, features: { subscription_cancel: { enabled: true, mode: "at_period_end" }, payment_method_update: { enabled: true }, subscription_update: { enabled: false } } }) : missing();
      if (url.pathname === "/v1/customers" && req.method === "POST") {
        const value = { id: `cus_fixture_${++state.customerCreates}`, object: "customer", livemode: false };
        state.customers.set(value.id, value); return finish(value);
      }
      if (url.pathname.startsWith("/v1/customers/")) return mapped(state.customers);
      if (url.pathname === "/v1/subscriptions") return reply({ object: "list", has_more: false, data: [...state.subscriptions.values()].filter(s => s.customer === url.searchParams.get("customer")) });
      if (url.pathname.startsWith("/v1/subscriptions/")) {
        const sub = state.subscriptions.get(url.pathname.split("/").pop());
        return sub ? reply({ ...sub, latest_invoice: invoiceResponse(sub.latest_invoice, "latest_invoice.amount_paid_off_stripe") }) : reply({ error: { type: "invalid_request_error", message: "No such subscription" } }, 404);
      }
      if (url.pathname === "/v1/checkout/sessions" && req.method === "POST") {
        if (Number(form.get("expires_at")) < Math.floor(Date.now() / 1000) + 1800) return reply({ error: { type: "invalid_request_error", message: "expires_at must be at least 30 minutes after creation" } }, 400);
        const value = { id: `cs_test_fixture_${++state.checkoutCreates}`, object: "checkout.session", mode: "subscription", status: "open", payment_status: "unpaid", customer: form.get("customer"), livemode: false, url: `https://checkout.stripe.com/c/pay/local_fixture_${state.checkoutCreates}`, expires_at: Number(form.get("expires_at")) };
        state.sessions.set(value.id, value); return finish(value);
      }
      if (url.pathname.startsWith("/v1/checkout/sessions/")) return mapped(state.sessions);
      if (url.pathname.startsWith("/v1/invoices/")) {
        const invoice = state.invoices.get(url.pathname.split("/").pop());
        return invoice ? reply(invoiceResponse(invoice, "amount_paid_off_stripe")) : missing();
      }
      if (url.pathname.startsWith("/v1/charges/")) return mapped(state.charges);
      if (url.pathname === "/v1/billing_portal/sessions") return finish({ id: "bps_fixture", customer: form.get("customer"), url: "https://billing.stripe.com/p/session/local_fixture" });
      return reply({ error: { type: "invalid_request_error", message: "Unimplemented fixture" } }, 404);
    } catch (error) {
      const business = ["scenario_limit", "scenario_conflict", "account_required", "customer_conflict", "checkout_conflict", "invalid_checkout", "invalid_customer"].includes(error.message);
      res.writeHead(business ? 400 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(business ? { message: error.message, code: "P0001" } : { error: "fixture_failure" }));
    }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  Object.assign(env, { SUPABASE_URL: origin, PRO_STRIPE_API_ORIGIN: origin });
  const before = {};
  for (const [key, value] of Object.entries(env)) { before[key] = process.env[key]; process.env[key] = value; }
  const stripe = createProStripe(env), store = createProStore({ env });
  return {
    env, db, state, users, store, stripe,
    scenario: () => ({ id: randomUUID(), name: "Card scenario", quantity: 2, inputs: { ...INPUTS } }),
    paidSubscription(customerId, { id = "sub_fixture", status = "active", invoicePaid = true, end = Math.floor(Date.now() / 1000) + 86400 } = {}) {
      const invoice = { id: `in_${id}`, status: invoicePaid ? "paid" : "open", livemode: false, customer: customerId, currency: "usd", amount_paid: invoicePaid ? 999 : 0, amount_paid_off_stripe: 0, amount_remaining: invoicePaid ? 0 : 999, parent: { subscription_details: { subscription: id } } };
      const itemPrice = price(); itemPrice.product = env.PRO_STRIPE_PRODUCT_ID;
      const sub = { id, object: "subscription", customer: customerId, livemode: false, status, cancel_at_period_end: false, latest_invoice: invoice, items: { data: [{ id: "si_fixture", price: itemPrice, quantity: 1, current_period_end: end }], has_more: false } };
      state.invoices.set(invoice.id, invoice); state.subscriptions.set(id, sub); return sub;
    },
    event(type, object, { id = `evt_${randomUUID().replaceAll("-", "")}`, created = Math.floor(Date.now() / 1000), live = false } = {}) { return { id, object: "event", type, livemode: live, created, api_version: PRO_STRIPE_API_VERSION, data: { object } }; },
    signed(event) { const raw = JSON.stringify(event); return { raw, signature: stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.PRO_STRIPE_WEBHOOK_SECRET }) }; },
    async close() { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } await new Promise(resolve => server.close(resolve)); await db.close(); },
  };
}
