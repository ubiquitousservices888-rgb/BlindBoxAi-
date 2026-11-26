import { assertBlindBoxSupabaseOrigin } from "./blindbox-supabase-boundary.mjs";

export const PRO_INTEGRATION = "blindboxai_pro_v1";
export const PRO_AMOUNT_CENTS = 999;
export const PRO_LIVE_PRICE = "price_1UKettEMF0eSPWJdNZYtb7sr";
export const PRO_LIVE_PRODUCT = "prod_VLLaWLVDl8Nmoa";
export const PRO_EVENTS = [
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required",
  "charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created",
];

export class ProError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

export function proTestRuntime(env = process.env) {
  return env.BLINDBOXAI_ALLOW_TEST_INGEST === "true" &&
    (env.NODE_ENV === "test" || env.CI === "true" || Boolean(env.NODE_TEST_CONTEXT));
}

export function proOrigin(env = process.env) {
  let url;
  try { url = new URL(env.PRO_APP_ORIGIN || "https://blindboxai.com"); } catch { throw new ProError("configuration_unavailable"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new ProError("configuration_unavailable");
  if (["https://blindboxai.com", "https://www.blindboxai.com"].includes(url.origin)) return url.origin;
  if (proTestRuntime(env) && url.protocol === "http:" && url.hostname === "127.0.0.1") return url.origin;
  throw new ProError("configuration_unavailable");
}

export function assertProOrigin(request, env = process.env) {
  const expected = proOrigin(env);
  const allowed = expected.startsWith("https:")
    ? new Set(["https://blindboxai.com", "https://www.blindboxai.com"]) : new Set([expected]);
  if (!allowed.has(request.headers.get("origin"))) throw new ProError("invalid_origin", 403);
}

function validProStripeKey(mode, key) {
  if (typeof key !== "string" || key !== key.trim()) return false;
  if (mode === "live") return /^rk_live_[A-Za-z0-9_]+$/.test(key);
  return mode === "test" && /^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(key);
}

export function proStripeConfig(env = process.env, { checkout = false, webhook = false } = {}) {
  const mode = env.PRO_STRIPE_MODE;
  const live = mode === "live";
  if (!validProStripeKey(mode, env.PRO_STRIPE_SECRET_KEY)) {
    throw new ProError("configuration_unavailable");
  }
  const price = live ? PRO_LIVE_PRICE : env.PRO_STRIPE_PRICE_ID;
  const product = live ? PRO_LIVE_PRODUCT : env.PRO_STRIPE_PRODUCT_ID;
  if (!/^price_[A-Za-z0-9_]+$/.test(price || "") || !/^prod_[A-Za-z0-9_]+$/.test(product || "")) throw new ProError("configuration_unavailable");
  if ((live && env.PRO_STRIPE_PRICE_ID && env.PRO_STRIPE_PRICE_ID !== price) ||
      (live && env.PRO_STRIPE_PRODUCT_ID && env.PRO_STRIPE_PRODUCT_ID !== product)) throw new ProError("configuration_unavailable");
  if (checkout && (env.PRO_PAYMENTS_ENABLED !== "true" || env.PRO_SCHEMA_VERSION !== "1" ||
      env.PRO_AUTH_EMAIL_READY !== "true" || !env.PRO_STRIPE_PORTAL_CONFIGURATION_ID ||
      !env.PRO_STRIPE_WEBHOOK_ENDPOINT_ID || !/^whsec_[A-Za-z0-9_]+$/.test(env.PRO_STRIPE_WEBHOOK_SECRET || "") ||
      (live && env.PRO_LIVE_BILLING_APPROVED !== "true") ||
      !["manual-reviewed", "stripe-tax-registered"].includes(env.PRO_TAX_CONFIGURATION))) throw new ProError("checkout_unavailable");
  if (webhook && !/^whsec_[A-Za-z0-9_]+$/.test(env.PRO_STRIPE_WEBHOOK_SECRET || "")) throw new ProError("configuration_unavailable");
  return { live, price, product, origin: proOrigin(env), automaticTax: env.PRO_TAX_CONFIGURATION === "stripe-tax-registered" };
}

export function proCheckoutConfigured(env = process.env) {
  try {
    proStripeConfig(env, { checkout: true, webhook: true });
    assertBlindBoxSupabaseOrigin(env.SUPABASE_URL, { allowTestLoopback: true });
    return [env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_SERVICE_ROLE_KEY].every(value => typeof value === "string" && value.trim().length > 0);
  }
  catch { return false; }
}

export function proMissingSettings(env = process.env) {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "PRO_STRIPE_MODE", "PRO_STRIPE_SECRET_KEY", "PRO_STRIPE_WEBHOOK_SECRET", "PRO_STRIPE_WEBHOOK_ENDPOINT_ID", "PRO_STRIPE_PORTAL_CONFIGURATION_ID", "PRO_AUTH_EMAIL_READY", "PRO_TAX_CONFIGURATION", "PRO_SCHEMA_VERSION", "PRO_PAYMENTS_ENABLED"];
  required.push(...(env.PRO_STRIPE_MODE === "live" ? ["PRO_LIVE_BILLING_APPROVED"] : ["PRO_STRIPE_PRICE_ID", "PRO_STRIPE_PRODUCT_ID"]));
  return required.filter(name => !env[name] ||
    (["PRO_PAYMENTS_ENABLED", "PRO_AUTH_EMAIL_READY", "PRO_LIVE_BILLING_APPROVED"].includes(name) && env[name] !== "true") ||
    (name === "PRO_SCHEMA_VERSION" && env[name] !== "1") ||
    (name === "PRO_STRIPE_MODE" && !["test", "live"].includes(env[name])) ||
    (name === "PRO_STRIPE_SECRET_KEY" && !validProStripeKey(env.PRO_STRIPE_MODE, env[name])) ||
    (name === "PRO_TAX_CONFIGURATION" && !["manual-reviewed", "stripe-tax-registered"].includes(env[name])) ||
    (name === "PRO_STRIPE_WEBHOOK_SECRET" && !/^whsec_[A-Za-z0-9_]+$/.test(env[name])));
}

export async function readProBody(request, limit = 8192, json = true) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new ProError("request_too_large", 413);
  const reader = request.body?.getReader();
  let size = 0;
  const chunks = [];
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new ProError("request_too_large", 413);
      chunks.push(value);
    }
  } finally { try { await reader?.cancel(); } catch {} }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!json) return raw;
  if (String(request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new ProError("invalid_request", 400);
  try { const value = JSON.parse(raw); if (value && typeof value === "object" && !Array.isArray(value)) return value; } catch {}
  throw new ProError("invalid_request", 400);
}

export function proJson(body, status = 200, extraHeaders = undefined) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Vary", "Cookie, Authorization");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}

export function recordProFailure(error, operation = "pro") {
  if (!(error instanceof ProError) || error.status >= 500) {
    const names = new Set(["Error", "TypeError", "RangeError", "StripeInvalidRequestError", "StripeAPIError", "StripeAuthenticationError", "StripeRateLimitError", "StripeConnectionError", "AuthApiError", "AuthRetryableFetchError"]);
    const operations = new Set(["pro", "auth", "access", "checkout", "portal", "webhook", "scenarios", "callback", "logout"]);
    // Provider messages, stack traces and URLs can contain credentials or PII.
    console.error("pro_request_failed", { operation: operations.has(operation) ? operation : "pro", category: error instanceof ProError ? "controlled_failure" : names.has(error?.name) ? error.name : "unexpected_error" });
  }
}

export function proFailure(error, headers, operation = "pro") {
  recordProFailure(error, operation);
  return proJson({ error: error instanceof ProError ? error.code : "service_unavailable" }, error instanceof ProError ? error.status : 503, headers);
}
