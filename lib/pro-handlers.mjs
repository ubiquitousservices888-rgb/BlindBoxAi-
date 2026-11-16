import { assertProOrigin, proOrigin, proJson, proFailure, recordProFailure, ProError, proStripeConfig, readProBody, proCheckoutAvailable } from "./pro-config.mjs";
import { proAuth, requireProUser, assertProAuthResult, clearProAuthCookies } from "./pro-auth.mjs";
import { createProStore } from "./pro-store.mjs";
import { createProCheckout, createProStripe, inspectProPortal, stripeId } from "./pro-stripe.mjs";
import { requireProEntitlement, resolveProEntitlement } from "./pro-entitlements.mjs";
import { processProWebhook } from "./pro-webhook.mjs";
import { normalizeProScenario, PRO_UUID, proScenariosCsv } from "./pro-collection.mjs";

function context(request) {
  const auth = proAuth(request);
  return { auth, store: createProStore(), stripe: createProStripe() };
}

export async function proSignoutHandler(request) {
  const headers = new Headers();
  try {
    assertProOrigin(request);
    let revocationPending = false;
    try {
      const auth = proAuth(request);
      const { error } = await auth.client.auth.signOut({ scope: "local" });
      if (error) { recordProFailure(error, "logout"); revocationPending = true; }
      for (const cookie of auth.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
    } catch (error) { recordProFailure(error, "logout"); revocationPending = true; }
    clearProAuthCookies(request, headers);
    return proJson({ ok: true, revocationPending }, 200, headers);
  } catch (error) { return proFailure(error, headers, "logout"); }
}

export async function proAuthHandler(request) {
  let headers;
  try {
    assertProOrigin(request);
    const auth = proAuth(request); headers = auth.headers;
    const store = createProStore();
    await store.version();
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",", 1)[0].slice(0, 64);
    await store.rateLimit(ip, "auth-ip", 30, 3600);
    const body = await readProBody(request);
    if (body.action === "password") {
      await requireProUser(auth);
      if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) throw new ProError("invalid_password", 400);
      const { error } = await auth.client.auth.updateUser({ password: body.password });
      if (error) throw new ProError("account_update_failed", 400);
      return proJson({ ok: true }, 200, headers);
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ProError("invalid_email", 400);
    await store.rateLimit(email, "auth-email", 6, 300);
    if (body.action === "recover") {
      const { error } = await auth.client.auth.resetPasswordForEmail(email, { redirectTo: `${proOrigin()}/api/pro/auth/callback` });
      if (error) throw new ProError("account_unavailable");
      return proJson({ ok: true, message: "Check your email for the account recovery link." }, 200, headers);
    }
    if (!["login", "signup"].includes(body.action) || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) throw new ProError("invalid_credentials", 400);
    if (body.action === "signup") {
      const { error } = await auth.client.auth.signUp({ email, password: body.password, options: { emailRedirectTo: `${proOrigin()}/api/pro/auth/callback` } });
      if (error) throw new ProError("account_unavailable", 400);
      return proJson({ ok: true, message: "Check your email to confirm your account, then sign in." }, 200, headers);
    }
    const { error } = await auth.client.auth.signInWithPassword({ email, password: body.password });
    assertProAuthResult(error, "invalid_credentials");
    await requireProUser(auth);
    return proJson({ ok: true }, 200, headers);
  } catch (error) { return proFailure(error, headers, "auth"); }
}

export async function proAuthCallback(request) {
  let headers;
  try {
    const auth = proAuth(request); headers = auth.headers;
    const code = new URL(request.url).searchParams.get("code");
    if (!code || code.length > 2048) throw new ProError("invalid_confirmation", 400);
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",", 1)[0].slice(0, 64);
    await createProStore().rateLimit(ip, "auth-callback-ip", 30, 3600);
    const { error } = await auth.client.auth.exchangeCodeForSession(code);
    assertProAuthResult(error, "invalid_confirmation");
    await requireProUser(auth);
    headers.set("Location", `${proOrigin()}/pro/account`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Referrer-Policy", "no-referrer");
    return new Response(null, { status: 303, headers });
  } catch (error) {
    recordProFailure(error, "callback");
    const output = new Headers(headers);
    let origin = "https://blindboxai.com";
    try { origin = proOrigin(); } catch { /* Fixed first-party recovery destination. */ }
    output.set("Location", `${origin}/pro/account?auth=${error instanceof ProError && error.status < 500 ? "confirmation_failed" : "service_unavailable"}`);
    output.set("Cache-Control", "private, no-store"); output.set("Referrer-Policy", "no-referrer");
    return new Response(null, { status: 303, headers: output });
  }
}

export async function proAccessHandler(request) {
  let headers;
  try {
    const auth = proAuth(request); headers = auth.headers;
    const user = await requireProUser(auth);
    const store = createProStore();
    await store.rateLimit(user.id, "access", 60, 60);
    let stripe;
    try { stripe = createProStripe(); }
    catch { return proJson({ signedIn: true, allowed: false, checkoutAvailable: false, billingAvailable: false, reason: "billing_unavailable" }, 200, headers); }
    const access = await resolveProEntitlement({ userId: user.id, store, stripe });
    return proJson({ signedIn: true, checkoutAvailable: proCheckoutAvailable(), ...access }, 200, headers);
  } catch (error) { return proFailure(error, headers, "access"); }
}

export async function proCheckoutHandler(request) {
  let headers;
  try {
    assertProOrigin(request);
    proStripeConfig(process.env, { checkout: true });
    const body = await readProBody(request);
    if (Object.keys(body).length) throw new ProError("invalid_request", 400);
    const { auth, store, stripe } = context(request); headers = auth.headers;
    const user = await requireProUser(auth);
    return proJson(await createProCheckout({ user, store, stripe }), 201, headers);
  } catch (error) { return proFailure(error, headers, "checkout"); }
}

export async function proPortalHandler(request) {
  let headers;
  try {
    assertProOrigin(request);
    await readProBody(request);
    const { auth, store, stripe } = context(request); headers = auth.headers;
    const user = await requireProUser(auth);
    const config = proStripeConfig();
    await store.rateLimit(user.id, "portal", 10, 60);
    const account = await store.account(user.id, config.live);
    if (!account?.stripe_customer_id || !process.env.PRO_STRIPE_PORTAL_CONFIGURATION_ID) throw new ProError("billing_unavailable", 409);
    await inspectProPortal(stripe, process.env, config);
    const customer = await stripe.customers.retrieve(account.stripe_customer_id);
    if (customer.deleted || customer.livemode !== config.live) throw new ProError("billing_unavailable", 409);
    const session = await stripe.billingPortal.sessions.create({ customer: account.stripe_customer_id, configuration: process.env.PRO_STRIPE_PORTAL_CONFIGURATION_ID, return_url: `${config.origin}/pro/account` });
    const url = new URL(session.url);
    if (url.origin !== "https://billing.stripe.com" || stripeId(session.customer) !== account.stripe_customer_id || url.username || url.password) throw new ProError("billing_unavailable");
    return proJson({ url: url.toString() }, 201, headers);
  } catch (error) { return proFailure(error, headers, "portal"); }
}

export async function proWebhookHandler(request) {
  try {
    const raw = await readProBody(request, 1024 * 1024, false);
    const stripe = createProStripe();
    const result = await processProWebhook({ raw, signature: request.headers.get("stripe-signature"), stripe, store: createProStore() });
    return proJson(result);
  } catch (error) { return proFailure(error, undefined, "webhook"); }
}

export async function proScenarioHandler(request, { csv = false } = {}) {
  let headers;
  try {
    if (request.method !== "GET") assertProOrigin(request);
    const { auth, store, stripe } = context(request); headers = auth.headers;
    const user = await requireProUser(auth);
    await store.rateLimit(user.id, "scenarios", 60, 60);
    await requireProEntitlement({ userId: user.id, store, stripe });
    if (request.method === "POST") {
      const scenario = normalizeProScenario(await readProBody(request));
      return proJson({ scenario: await store.saveScenario(user.id, scenario) }, 200, headers);
    }
    if (request.method === "DELETE") {
      const body = await readProBody(request);
      if (typeof body.id !== "string" || !PRO_UUID.test(body.id)) throw new ProError("invalid_scenario", 400);
      await store.deleteScenario(user.id, body.id);
      return proJson({ ok: true }, 200, headers);
    }
    const rows = await store.scenarios(user.id);
    if (!csv) return proJson({ scenarios: rows }, 200, headers);
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set("Content-Disposition", 'attachment; filename="blindboxai-pro-scenarios.csv"');
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(proScenariosCsv(rows), { headers });
  } catch (error) { return proFailure(error, headers, "scenarios"); }
}
