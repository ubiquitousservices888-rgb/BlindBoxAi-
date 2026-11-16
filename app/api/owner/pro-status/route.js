import { assertOwnerCode } from "../../../../lib/evidence";
import { createProStore } from "../../../../lib/pro-store.mjs";
import { createProStripe, inspectProDelivery, inspectProPrice } from "../../../../lib/pro-stripe.mjs";
import { proJson, proCheckoutAvailable, proMissingSettings, proStripeConfig } from "../../../../lib/pro-config.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  try { assertOwnerCode(String(request.headers.get("authorization") || "").replace(/^Bearer /, "")); }
  catch { return proJson({ error: "Unauthorized" }, 401); }
  const missing = proMissingSettings();
  const checks = { schema: null, price: null, delivery: null, configuration: null };
  try { await createProStore().version(); checks.schema = true; } catch { checks.schema = false; }
  try { proStripeConfig(process.env, { checkout: true, webhook: true }); checks.configuration = true; } catch { checks.configuration = false; }
  let config, stripe;
  try { config = proStripeConfig(); stripe = createProStripe(); } catch { /* Provider checks remain not run. */ }
  if (stripe) {
    try { await inspectProPrice(stripe, config); checks.price = true; } catch { checks.price = false; }
    try { await inspectProDelivery(stripe, process.env, config); checks.delivery = true; } catch { checks.delivery = false; }
  }
  return proJson({ ready: Object.values(checks).every(value => value === true) && proCheckoutAvailable(), checks, missing, liveChargesTested: false, customerEmailDeliveryVerifiedByThisCheck: false, storedRevenueVerifiedByThisCheck: false });
}
