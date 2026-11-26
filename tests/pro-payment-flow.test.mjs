import test from "node:test";
import assert from "node:assert/strict";
import { proFixtures, USER_A, USER_B } from "./pro-fixtures.mjs";
import { createProCheckout, proCheckoutAvailable, PRO_STRIPE_API_VERSION } from "../lib/pro-stripe.mjs";
import { processProWebhook } from "../lib/pro-webhook.mjs";
import { resolveProEntitlement } from "../lib/pro-entitlements.mjs";
import { proCheckoutHandler, proAuthHandler, proAuthCallback, proSignoutHandler, proAccessHandler, proScenarioHandler, proPortalHandler } from "../lib/pro-handlers.mjs";
import { normalizeProScenario, proScenariosCsv } from "../lib/pro-collection.mjs";

test("one checkout, signed fulfillment, renewal failure, cancellation, and risk events use disposable HTTP services", async () => {
  const f = await proFixtures();
  try {
    const options = { user: f.users.get(USER_A), store: f.store, stripe: f.stripe, env: f.env };
    const [one, two] = await Promise.all([createProCheckout(options), createProCheckout(options)]);
    assert.equal(one.url, two.url); assert.equal(f.state.customerCreates, 1); assert.equal(f.state.checkoutCreates, 1);
    const request = f.state.requests.find(r => r.path === "/v1/checkout/sessions" && r.method === "POST");
    assert.equal(request.params["line_items[0][price]"], f.env.PRO_STRIPE_PRICE_ID);
    assert.equal(request.params["subscription_data[billing_mode][type]"], "flexible");
    assert.match(request.params.integration_identifier, /^blindboxai_pro_[a-z]{8}$/);
    assert.equal(Object.keys(request.params).some(k => k.includes("payment_method_types")), false);
    const access = () => resolveProEntitlement({ userId: USER_A, store: f.store, stripe: f.stripe, env: f.env });
    assert.equal((await access()).allowed, false, "returning from checkout grants nothing");
    const account = await f.store.account(USER_A, false);
    const sub = f.paidSubscription(account.stripe_customer_id);
    const session = f.state.sessions.get(account.checkout_session_id);
    Object.assign(session, { status: "complete", payment_status: "paid", subscription: sub.id });
    const event = f.event("checkout.session.completed", session);
    const deliver = event => processProWebhook({ ...f.signed(event), stripe: f.stripe, store: f.store, env: f.env });
    await assert.rejects(processProWebhook({ raw: JSON.stringify(event), signature: "forged", stripe: f.stripe, store: f.store, env: f.env }), /invalid_signature/);
    assert.equal((await access()).allowed, false);
    await deliver(event); assert.equal((await access()).allowed, true);
    assert.equal((await deliver(event)).duplicate, true);
    assert.equal((await f.db.query("select count(*)::int as n from public.pro_stripe_events")).rows[0].n, 1);
    await assert.rejects(createProCheckout(options), /manage_existing_subscription/);
    assert.equal(f.state.checkoutCreates, 1);
    sub.latest_invoice.status = "open"; sub.latest_invoice.amount_paid = 0; sub.latest_invoice.amount_remaining = 999;
    await deliver(f.event("invoice.payment_failed", sub.latest_invoice));
    assert.equal((await access()).allowed, false, "failed renewal never keeps paid access");
    Object.assign(sub.latest_invoice, { status: "paid", amount_paid: 999, amount_remaining: 0 });
    await deliver(f.event("invoice.paid", sub.latest_invoice));
    assert.equal((await access()).allowed, true);
    sub.cancel_at_period_end = true;
    await deliver(f.event("customer.subscription.updated", sub));
    assert.equal((await access()).cancelAtPeriodEnd, true);
    sub.status = "canceled";
    await deliver(f.event("customer.subscription.deleted", sub, { created: Math.floor(Date.now() / 1000) + 1 }));
    sub.status = "active";
    await deliver(f.event("customer.subscription.updated", { ...sub, status: "active" }, { created: Math.floor(Date.now() / 1000) - 30 }));
    assert.equal((await f.db.query("select status from public.pro_subscriptions where subscription_id=$1", [sub.id])).rows[0].status, "canceled");
    assert.equal((await access()).allowed, false, "old event cannot restore canceled access");
    sub.status = "active";
    await deliver(f.event("customer.subscription.updated", sub, { created: Math.floor(Date.now() / 1000) + 2 }));
    assert.equal((await access()).allowed, true);
    f.state.charges.set("ch_risk", { id: "ch_risk", livemode: false, customer: account.stripe_customer_id, amount_refunded: 1 });
    await deliver(f.event("charge.refunded", { id: "ch_risk" }, { created: 1 }));
    assert.equal((await access()).reason, "billing_review_required", "even an older refund sets a sticky hold");
    await deliver(f.event("invoice.paid", sub.latest_invoice, { created: Math.floor(Date.now() / 1000) + 3 }));
    assert.equal((await access()).allowed, false);
    const other = await deliver(f.event("charge.dispute.created", { id: "dp_fixture", charge: "ch_risk" })); assert.equal(other.received, true);
    await deliver(f.event("radar.early_fraud_warning.created", { id: "issfr_fixture", charge: "ch_risk" }));
    const wrongMode = f.event("invoice.paid", sub.latest_invoice, { live: true });
    await assert.rejects(deliver(wrongMode), /event_mismatch/);
    const unknown = f.paidSubscription("cus_other_project", { id: "sub_other" });
    assert.equal((await deliver(f.event("customer.subscription.created", unknown))).ignored, true);
    assert.equal((await f.store.subscriptions(USER_B, false)).length, 0);
  } finally { await f.close(); }
});

test("configuration, price, delivery and origin failures make no provider write", async () => {
  const f = await proFixtures();
  try {
    const options = { user: f.users.get(USER_A), store: f.store, stripe: f.stripe, env: f.env };
    await assert.rejects(createProCheckout({ ...options, env: { ...f.env, PRO_PAYMENTS_ENABLED: "false" } }), /checkout_unavailable/);
    f.state.priceValid = false;
    await assert.rejects(createProCheckout(options), /price_unavailable/);
    f.state.priceValid = true; f.state.deliveryValid = false;
    await assert.rejects(createProCheckout(options), /billing_delivery_unavailable/);
    assert.equal(f.state.writes, 0);
    const result = await proCheckoutHandler(new Request(`${f.env.PRO_APP_ORIGIN}/api/pro/checkout`, { method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" }, body: "{}" }));
    assert.equal(result.status, 403); assert.equal(f.state.writes, 0);
  } finally { await f.close(); }
});

test("Pro requires zero off-Stripe cents on both invoice retrieval paths", async () => {
  const f = await proFixtures();
  try {
    await f.store.claimCheckout(USER_A, false);
    await f.store.bindCustomer(USER_A, false, "cus_pro_fixture");
    const sub = f.paidSubscription("cus_pro_fixture");
    const invoice = sub.latest_invoice;
    const event = f.event("customer.subscription.updated", sub);
    await processProWebhook({ ...f.signed(event), stripe: f.stripe, store: f.store, env: f.env });
    const access = () => resolveProEntitlement({ userId: USER_A, store: f.store, stripe: f.stripe, env: f.env });
    for (const fallback of [false, true]) {
      sub.latest_invoice = fallback ? invoice.id : invoice;
      for (const [label, offStripeCents, allowed] of [
        ["missing", undefined, false],
        ["null", null, false],
        ["string zero", "0", false],
        ["entirely off-Stripe", 999, false],
        ["mixed payment", 400, false],
        ["Stripe-collected", 0, true],
      ]) {
        if (offStripeCents === undefined) delete invoice.amount_paid_off_stripe;
        else invoice.amount_paid_off_stripe = offStripeCents;
        const start = f.state.requests.length;
        assert.equal((await access()).allowed, allowed, `${label}, ${fallback ? "fallback" : "expanded"} invoice`);
        const requests = f.state.requests.slice(start);
        const subscription = requests.find(request => request.path === `/v1/subscriptions/${sub.id}`);
        const fetchedInvoice = requests.find(request => request.path === `/v1/invoices/${invoice.id}`);
        assert.equal(subscription?.stripeVersion, PRO_STRIPE_API_VERSION);
        assert.deepEqual(Object.values(subscription.query), ["latest_invoice.amount_paid_off_stripe"]);
        if (fallback) {
          assert.equal(fetchedInvoice?.stripeVersion, PRO_STRIPE_API_VERSION);
          assert.deepEqual(Object.values(fetchedInvoice.query), ["amount_paid_off_stripe"]);
        } else {
          assert.equal(fetchedInvoice, undefined);
        }
      }
    }
  } finally { await f.close(); }
});

for (const committed of [false, true]) test(`a lost ${committed ? "committed" : "uncommitted"} checkout checkpoint retries once and delayed payments stay unfulfilled`, async () => {
  const f = await proFixtures();
  try {
    let checkpoints = 0;
    const store = { ...f.store, saveCheckout: async (...args) => { const result = committed ? await f.store.saveCheckout(...args) : undefined; if (++checkpoints === 1) throw new Error("simulated lost storage response"); return committed ? result : f.store.saveCheckout(...args); } };
    const options = { user: f.users.get(USER_A), store, stripe: f.stripe, env: f.env };
    await assert.rejects(createProCheckout(options), /simulated lost storage response/);
    const resumed = await createProCheckout(options);
    assert.match(resumed.url, /^https:\/\/checkout\.stripe\.com\//);
    assert.equal(f.state.customerCreates, 1); assert.equal(f.state.checkoutCreates, 1);
    const account = await f.store.account(USER_A, false);
    const session = f.state.sessions.get(account.checkout_session_id);
    const sub = f.paidSubscription(account.stripe_customer_id, { status: "incomplete", invoicePaid: false });
    Object.assign(session, { status: "complete", payment_status: "unpaid", subscription: sub.id });
    const deliver = type => processProWebhook({ ...f.signed(f.event(type, session)), stripe: f.stripe, store: f.store, env: f.env });
    const access = () => resolveProEntitlement({ userId: USER_A, store: f.store, stripe: f.stripe, env: f.env });
    await deliver("checkout.session.completed"); assert.equal((await access()).allowed, false);
    await deliver("checkout.session.async_payment_failed"); assert.equal((await access()).allowed, false);
    Object.assign(sub, { status: "active" }); Object.assign(sub.latest_invoice, { status: "paid", amount_paid: 999, amount_remaining: 0 });
    session.payment_status = "paid";
    await deliver("checkout.session.async_payment_succeeded"); assert.equal((await access()).allowed, true);
    sub.latest_invoice.amount_paid_off_stripe = 999;
    assert.equal((await access()).allowed, false, "manual off-Stripe payment is not provider payment proof");
    sub.latest_invoice.amount_paid_off_stripe = 0;
    sub.items.data[0].current_period_end = Math.floor(Date.now() / 1000) - 1;
    assert.equal((await access()).allowed, false, "expired paid period cannot grant access");
    assert.equal((await resolveProEntitlement({ userId: USER_B, store: f.store, stripe: f.stripe, env: f.env })).allowed, false);
  } finally { await f.close(); }
});

test("a delayed claim still satisfies Stripe's minimum Checkout expiration window", async () => {
  const f = await proFixtures();
  try {
    await f.store.claimCheckout(USER_A, false);
    await f.db.query("update public.pro_accounts set checkout_attempt_created_at=now()-interval '20 minutes' where user_id=$1", [USER_A]);
    await createProCheckout({ user: f.users.get(USER_A), store: f.store, stripe: f.stripe, env: f.env });
    const session = [...f.state.sessions.values()][0];
    assert.ok(session.expires_at - Date.now() / 1000 > 39 * 60);
    assert.equal(f.state.checkoutCreates, 1);
  } finally { await f.close(); }
});

test("an elapsed timestamp with a still-open provider session cannot create overlapping checkout", async () => {
  const f = await proFixtures();
  try {
    const options = { user: f.users.get(USER_A), store: f.store, stripe: f.stripe, env: f.env };
    await createProCheckout(options);
    const session = [...f.state.sessions.values()][0]; session.expires_at = Math.floor(Date.now() / 1000) - 1;
    await f.db.query("update public.pro_accounts set checkout_expires_at=now()-interval '1 second' where user_id=$1", [USER_A]);
    const writesBefore = f.state.writes;
    await assert.rejects(createProCheckout(options), /checkout_conflict/);
    assert.equal(f.state.writes, writesBefore); assert.equal(f.state.checkoutCreates, 1);
  } finally { await f.close(); }
});

test("authenticated routes isolate saved scenarios, CSV exports and portal ownership", async () => {
  const f = await proFixtures();
  try {
    const makeRequest = (path, { method = "GET", body, cookie } = {}) => new Request(`${f.env.PRO_APP_ORIGIN}${path}`, { method, headers: { Origin: f.env.PRO_APP_ORIGIN, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const login = async email => {
      const response = await proAuthHandler(makeRequest("/api/pro/auth", { method: "POST", body: { action: "login", email, password: "local-test-password" } }));
      assert.equal(response.status, 200, await response.text());
      const cookies = response.headers.getSetCookie();
      assert.ok(cookies.length); assert.ok(cookies.every(c => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)));
      return cookies.map(c => c.split(";", 1)[0]).join("; ");
    };
    const cookieA = await login("one@example.test"), cookieB = await login("two@example.test");
    assert.equal((await proAccessHandler(makeRequest("/api/pro/access", { cookie: cookieA }))).status, 200);
    const forbidden = await proScenarioHandler(makeRequest("/api/pro/scenarios", { cookie: cookieA })); assert.equal(forbidden.status, 402);
    for (const [id, email] of [[USER_A, "one@example.test"], [USER_B, "two@example.test"]]) {
      await createProCheckout({ user: { id, email }, store: f.store, stripe: f.stripe, env: f.env });
      const account = await f.store.account(id, false);
      const sub = f.paidSubscription(account.stripe_customer_id, { id: `sub_${id.replaceAll("-", "")}` });
      const event = f.event("invoice.paid", sub.latest_invoice);
      await processProWebhook({ ...f.signed(event), stripe: f.stripe, store: f.store, env: f.env });
    }
    const scenario = f.scenario(); scenario.name = '=HYPERLINK("https://attacker.test")';
    const saved = await proScenarioHandler(makeRequest("/api/pro/scenarios", { method: "POST", cookie: cookieA, body: { ...scenario, user_id: USER_B } }));
    assert.equal(saved.status, 200, await saved.clone().text());
    const mine = await proScenarioHandler(makeRequest("/api/pro/scenarios", { cookie: cookieA }));
    assert.equal((await mine.json()).scenarios[0].user_id, USER_A);
    const theirs = await proScenarioHandler(makeRequest("/api/pro/scenarios", { cookie: cookieB })); assert.equal((await theirs.json()).scenarios.length, 0);
    const overwrite = await proScenarioHandler(makeRequest("/api/pro/scenarios", { method: "POST", cookie: cookieB, body: scenario })); assert.equal(overwrite.status, 409);
    const crossDelete = await proScenarioHandler(makeRequest("/api/pro/scenarios", { method: "DELETE", cookie: cookieB, body: { id: scenario.id } }));
    assert.equal(crossDelete.status, 404);
    assert.deepEqual(await crossDelete.json(), { error: "scenario_not_found" });
    assert.equal((await f.store.scenarios(USER_A)).length, 1);
    const csv = await proScenarioHandler(makeRequest("/api/pro/scenarios/export", { cookie: cookieA }), { csv: true });
    assert.equal(csv.status, 200); assert.match(await csv.text(), /' =|"'=HYPERLINK/);
    assert.match(csv.headers.get("Cache-Control"), /no-store/);
    const portal = await proPortalHandler(makeRequest("/api/pro/portal", { method: "POST", cookie: cookieA, body: { customer: (await f.store.account(USER_B, false)).stripe_customer_id } }));
    assert.equal(portal.status, 201);
    const portalWrite = f.state.requests.filter(r => r.path === "/v1/billing_portal/sessions").at(-1);
    assert.equal(portalWrite.params.customer, (await f.store.account(USER_A, false)).stripe_customer_id);
    const forged = await proCheckoutHandler(makeRequest("/api/pro/checkout", { method: "POST", cookie: cookieA, body: { price: "price_other", user_id: USER_B } })); assert.equal(forged.status, 400);
    const anonymous = await proScenarioHandler(makeRequest("/api/pro/scenarios")); assert.equal(anonymous.status, 401);
  } finally { await f.close(); }
});

test("database privileges, atomic claims, stale event ordering and malformed inputs fail closed", async () => {
  const f = await proFixtures();
  try {
    const claims = await Promise.all(Array.from({ length: 8 }, () => f.store.claimCheckout(USER_A, false)));
    assert.equal(new Set(claims.map(x => x.checkout_attempt_id)).size, 1);
    await f.db.query("update public.pro_accounts set checkout_attempt_created_at=now()-interval '1 day' where user_id=$1", [USER_A]);
    assert.equal((await f.store.claimCheckout(USER_A, false)).blocked, true);
    for (const role of ["anon", "authenticated"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(f.db.query("select * from public.pro_accounts"), /permission denied/);
      await assert.rejects(f.db.query("select public.pro_claim_checkout($1,false)", [USER_A]), /permission denied/);
      await f.db.exec("reset role");
    }
    const privileges = await f.db.query("select proname,prosecdef from pg_proc where proname like 'pro_%'");
    assert.ok(privileges.rows.every(r => r.prosecdef === false));
    const rls = await f.db.query("select relname,relrowsecurity from pg_class where relname in ('pro_accounts','pro_subscriptions','pro_stripe_events','pro_scenarios','pro_rate_limits')");
    assert.equal(rls.rows.length, 5); assert.ok(rls.rows.every(r => r.relrowsecurity));
    await assert.rejects(f.store.saveScenario(USER_A, { ...f.scenario(), inputs: {} }), /storage_unavailable/);
    const scenario = f.scenario(); assert.equal(normalizeProScenario(scenario).name, scenario.name);
    assert.throws(() => normalizeProScenario({ ...scenario, inputs: { ...scenario.inputs, feePercent: 100 } }), /invalid_scenario/);
    assert.throws(() => normalizeProScenario({ ...scenario, inputs: { ...scenario.inputs, salePrice: Infinity } }), /invalid_scenario/);
    assert.match(proScenariosCsv([{ ...scenario, name: "@SUM(1,2)" }]), /"'@SUM/);
    await f.store.rateLimit(USER_A, "test-bucket", 1, 60);
    await assert.rejects(f.store.rateLimit(USER_A, "test-bucket", 1, 60), /try_again_later/);
  } finally { await f.close(); }
});

for (const type of ["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"]) {
  test(`${type} independently places a previously healthy customer on hold`, async () => {
    const f = await proFixtures();
    try {
      await createProCheckout({ user: f.users.get(USER_A), store: f.store, stripe: f.stripe, env: f.env });
      const account = await f.store.account(USER_A, false), sub = f.paidSubscription(account.stripe_customer_id);
      const deliver = event => processProWebhook({ ...f.signed(event), stripe: f.stripe, store: f.store, env: f.env });
      await deliver(f.event("invoice.paid", sub.latest_invoice));
      const access = () => resolveProEntitlement({ userId: USER_A, store: f.store, stripe: f.stripe, env: f.env });
      assert.equal((await access()).allowed, true);
      f.state.charges.set("ch_independent", { id: "ch_independent", livemode: false, customer: account.stripe_customer_id, amount_refunded: type === "charge.refunded" ? 1 : 0 });
      await deliver(f.event(type, { id: type === "charge.refunded" ? "ch_independent" : "risk_fixture", charge: "ch_independent" }));
      assert.equal((await access()).reason, "billing_review_required");
      assert.equal((await f.store.account(USER_A, false)).risk_hold, true);
    } finally { await f.close(); }
  });
}

test("returning customers ignore canceled history; portal isolation, scenario caps and logout remain actionable", async () => {
  const f = await proFixtures();
  try {
    await createProCheckout({ user: f.users.get(USER_A), store: f.store, stripe: f.stripe, env: f.env });
    const account = await f.store.account(USER_A, false), sub = f.paidSubscription(account.stripe_customer_id);
    const event = f.event("invoice.paid", sub.latest_invoice);
    await processProWebhook({ ...f.signed(event), stripe: f.stripe, store: f.store, env: f.env });
    await f.db.query("insert into public.pro_subscriptions(subscription_id,livemode,user_id,price_id,status,event_created,last_event_id) select 'sub_old_'||n,false,$1,$2,'canceled',1,'evt_history_'||n from generate_series(1,10) n", [USER_A, f.env.PRO_STRIPE_PRICE_ID]);
    const access = () => resolveProEntitlement({ userId: USER_A, store: f.store, stripe: f.stripe, env: f.env });
    assert.equal((await access()).allowed, true); assert.equal((await f.store.subscriptions(USER_A, false)).length, 1);
    const makeRequest = (path, { method = "GET", body, cookie } = {}) => new Request(`${f.env.PRO_APP_ORIGIN}${path}`, { method, headers: { Origin: f.env.PRO_APP_ORIGIN, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const login = await proAuthHandler(makeRequest("/api/pro/auth", { method: "POST", body: { action: "login", email: "one@example.test", password: "local-test-password" } }));
    const cookie = login.headers.getSetCookie().map(c => c.split(";", 1)[0]).join("; ");
    f.state.portalIntegration = "another_product";
    assert.equal((await access()).billingAvailable, false);
    const writesBefore = f.state.writes;
    assert.equal((await proPortalHandler(makeRequest("/api/pro/portal", { method: "POST", body: {}, cookie }))).status, 503);
    assert.equal(f.state.writes, writesBefore);
    f.state.portalIntegration = "blindboxai_pro_v1";
    await f.db.query("insert into public.pro_scenarios(id,user_id,name,inputs,quantity) select gen_random_uuid(),$1,'Saved scenario '||n,$2::jsonb,1 from generate_series(1,250) n", [USER_A, JSON.stringify(f.scenario().inputs)]);
    const cap = await proScenarioHandler(makeRequest("/api/pro/scenarios", { method: "POST", body: f.scenario(), cookie }));
    assert.equal(cap.status, 409); assert.equal((await cap.json()).error, "scenario_limit");
    f.state.schemaDown = true;
    await f.db.exec("update public.pro_rate_limits set used=1000");
    const logout = await proSignoutHandler(makeRequest("/api/pro/auth", { method: "DELETE", cookie }));
    assert.equal(logout.status, 200); assert.ok(logout.headers.getSetCookie().some(c => /Max-Age=0/i.test(c)));
  } finally { await f.close(); }
});


test("provider availability rejects wrong IDs and actual service-role permission failures", async () => {
  const f = await proFixtures();
  try {
    const options = { env: f.env, stripe: f.stripe, store: f.store };
    assert.equal(await proCheckoutAvailable(options), true);
    for (const read of [() => f.stripe.prices.retrieve("price_wrong"), () => f.stripe.webhookEndpoints.retrieve("we_wrong"), () => f.stripe.billingPortal.configurations.retrieve("bpc_wrong"), () => f.stripe.customers.retrieve("cus_wrong"), () => f.stripe.checkout.sessions.retrieve("cs_test_wrong"), () => f.stripe.invoices.retrieve("in_wrong"), () => f.stripe.charges.retrieve("ch_wrong")]) await assert.rejects(read(), error => error.statusCode === 404);
    f.state.priceValid = false; assert.equal(await proCheckoutAvailable(options), false);
    f.state.priceValid = true; f.state.deliveryValid = false; assert.equal(await proCheckoutAvailable(options), false);
    f.state.deliveryValid = true; f.state.schemaDown = true; assert.equal(await proCheckoutAvailable(options), false);
    f.state.schemaDown = false;
    await f.db.exec("revoke select on public.pro_accounts from service_role");
    await assert.rejects(f.store.account(USER_A, false), /storage_unavailable/);
    await f.db.exec("grant select on public.pro_accounts to service_role");
    assert.equal(await f.store.account(USER_A, false), null);
    assert.equal(f.state.writes, 0);
  } finally { await f.close(); }
});

test("signup, recovery and password changes preserve provider outage codes", async () => {
  const f = await proFixtures();
  try {
    const request = (action, cookie) => new Request(`${f.env.PRO_APP_ORIGIN}/api/pro/auth`, { method: "POST", headers: { Origin: f.env.PRO_APP_ORIGIN, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ action, email: "one@example.test", password: "local-test-password" }) });
    const login = await proAuthHandler(request("login")); assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(c => c.split(";", 1)[0]).join("; ");
    for (const [action, path, method] of [["signup", "/auth/v1/signup", "POST"], ["recover", "/auth/v1/recover", "POST"], ["password", "/auth/v1/user", "PUT"]]) {
      f.state.authFailure = { path, method, status: 503 };
      const response = await proAuthHandler(request(action, cookie));
      assert.equal(response.status, 503); assert.equal((await response.json()).error, "auth_provider_unavailable");
    }
    const callback = () => proAuthCallback(new Request(`${f.env.PRO_APP_ORIGIN}/api/pro/auth/callback?code=invalid-fixture`));
    assert.match((await callback()).headers.get("location"), /auth=confirmation_failed/);
    await f.db.exec("update public.pro_rate_limits set used=1000");
    assert.match((await callback()).headers.get("location"), /auth=retry_later/);
  } finally { await f.close(); }
});
