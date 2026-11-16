import { assertOwnerCode } from "../../../../lib/evidence";
import { createProStore } from "../../../../lib/pro-store.mjs";
import { createProStripe, inspectProDelivery, inspectProPrice } from "../../../../lib/pro-stripe.mjs";
import { proJson, proCheckoutAvailable, proStripeConfig } from "../../../../lib/pro-config.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  try { assertOwnerCode(String(request.headers.get("authorization") || "").replace(/^Bearer /, "")); }
  catch { return proJson({ error: "Unauthorized" }, 401); }
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "PRO_STRIPE_MODE", "PRO_STRIPE_SECRET_KEY", "PRO_STRIPE_WEBHOOK_SECRET", "PRO_STRIPE_WEBHOOK_ENDPOINT_ID", "PRO_STRIPE_PORTAL_CONFIGURATION_ID", "PRO_AUTH_EMAIL_READY", "PRO_TAX_CONFIGURATION", "PRO_SCHEMA_VERSION"];
  const missing = required.filter(name => !process.env[name]);
  const checks = { schema: false, price: false, delivery: false, configuration: false };
  try {
    const config = proStripeConfig(); const stripe = createProStripe();
    await createProStore().version(); checks.schema = true;
    await inspectProPrice(stripe, config); checks.price = true;
    await inspectProDelivery(stripe, process.env, config); checks.delivery = true;
    proStripeConfig(process.env, { checkout: true }); checks.configuration = true;
  } catch { /* Only booleans and missing names, never provider bodies or secrets. */ }
  return proJson({ ready: Object.values(checks).every(Boolean) && proCheckoutAvailable(), checks, missing, liveChargesTested: false, customerEmailDeliveryVerifiedByThisCheck: false, storedRevenueVerifiedByThisCheck: false });
}
