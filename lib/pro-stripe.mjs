import Stripe from "stripe";
import { createHash } from "node:crypto";
import { PRO_AMOUNT_CENTS, PRO_EVENTS, PRO_INTEGRATION, ProError, proStripeConfig, proTestRuntime, proCheckoutConfigured } from "./pro-config.mjs";
import { createProStore } from "./pro-store.mjs";

export const PRO_STRIPE_API_VERSION = "2026-10-28.endive";
export const stripeId = value => typeof value === "string" ? value : value?.id;

export async function proCheckoutAvailable({ env = process.env, stripe, store } = {}) {
  if (!proCheckoutConfigured(env)) return false;
  try {
    const config = proStripeConfig(env, { checkout: true, webhook: true });
    const provider = stripe || createProStripe(env);
    await Promise.all([inspectProPrice(provider, config), inspectProDelivery(provider, env, config), (store || createProStore({ env })).version()]);
    return true;
  } catch { return false; }
}

export function createProStripe(env = process.env) {
  proStripeConfig(env);
  const options = { apiVersion: PRO_STRIPE_API_VERSION, timeout: 12000, maxNetworkRetries: 1 };
  if (env.PRO_STRIPE_API_ORIGIN) {
    const url = new URL(env.PRO_STRIPE_API_ORIGIN);
    if (!proTestRuntime(env) || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.username || url.password || url.search || url.hash) throw new ProError("configuration_unavailable");
    Object.assign(options, { host: url.hostname, port: Number(url.port || "80"), protocol: "http" });
  }
  return new Stripe(env.PRO_STRIPE_SECRET_KEY, options);
}

export async function inspectProPrice(stripe, config) {
  const price = await stripe.prices.retrieve(config.price, { expand: ["product"] });
  if (price.id !== config.price || price.active !== true || price.livemode !== config.live ||
      price.currency !== "usd" || price.unit_amount !== PRO_AMOUNT_CENTS || stripeId(price.product) !== config.product ||
      price.product?.deleted || price.product?.active === false || price.recurring?.interval !== "month" ||
      price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== "licensed" ||
      (config.live && price.lookup_key !== "blindboxai_pro_monthly") ||
      (config.automaticTax && !["inclusive", "exclusive"].includes(price.tax_behavior))) throw new ProError("price_unavailable");
  return price;
}

export async function inspectProDelivery(stripe, env, config) {
  const [endpoint] = await Promise.all([
    stripe.webhookEndpoints.retrieve(env.PRO_STRIPE_WEBHOOK_ENDPOINT_ID),
    inspectProPortal(stripe, env, config),
  ]);
  if (endpoint.status !== "enabled" || endpoint.livemode !== config.live || endpoint.url !== `${config.origin}/api/pro/webhook` ||
      endpoint.api_version !== PRO_STRIPE_API_VERSION || endpoint.metadata?.integration !== PRO_INTEGRATION || !PRO_EVENTS.every(type => endpoint.enabled_events?.includes(type))) throw new ProError("billing_delivery_unavailable");
}

export async function inspectProPortal(stripe, env, config) {
  if (!env.PRO_STRIPE_PORTAL_CONFIGURATION_ID) throw new ProError("billing_unavailable", 409);
  const portal = await stripe.billingPortal.configurations.retrieve(env.PRO_STRIPE_PORTAL_CONFIGURATION_ID);
  if (!portal.active || portal.livemode !== config.live || portal.features?.subscription_cancel?.enabled !== true ||
      portal.metadata?.integration !== PRO_INTEGRATION || portal.features?.subscription_update?.enabled !== false ||
      portal.features?.subscription_cancel?.mode !== "at_period_end" || portal.features?.payment_method_update?.enabled !== true) throw new ProError("billing_delivery_unavailable");
  return portal;
}

export async function currentProSubscription(stripe, subscriptionId, config) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice.amount_paid_off_stripe"],
  });
  const items = sub.items?.data || [];
  if (sub.id !== subscriptionId || sub.livemode !== config.live || sub.items?.has_more || items.length !== 1 ||
      items[0].price?.id !== config.price || stripeId(items[0].price?.product) !== config.product || items[0].quantity !== 1 ||
      items[0].price?.currency !== "usd" || items[0].price?.unit_amount !== PRO_AMOUNT_CENTS ||
      items[0].price?.recurring?.interval !== "month" || items[0].price?.recurring?.interval_count !== 1) throw new ProError("subscription_mismatch", 409);
  let invoice = sub.latest_invoice;
  if (typeof invoice === "string") {
    invoice = await stripe.invoices.retrieve(invoice, { expand: ["amount_paid_off_stripe"] });
  }
  const invoiceSub = stripeId(invoice?.parent?.subscription_details?.subscription);
  const paid = invoice?.status === "paid" && invoice.livemode === config.live && invoiceSub === sub.id &&
    stripeId(invoice.customer) === stripeId(sub.customer) && invoice.currency === "usd" &&
    Number.isInteger(invoice.amount_paid) && invoice.amount_paid >= PRO_AMOUNT_CENTS &&
    invoice.amount_paid_off_stripe === 0 && invoice.amount_remaining === 0;
  const end = items[0].current_period_end;
  return {
    id: sub.id, customer: stripeId(sub.customer), price_id: config.price, status: sub.status,
    paid_through: paid && Number.isInteger(end) && end > 0 ? new Date(end * 1000).toISOString() : null,
    latest_invoice_id: stripeId(invoice) || null,
    currentPaid: paid && sub.status === "active" && !sub.pause_collection && end * 1000 > Date.now(),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
  };
}

export function checkoutIntegrationId(attemptId) {
  const suffix = [...createHash("sha256").update(attemptId).digest().subarray(0, 8)].map(byte => String.fromCharCode(97 + byte % 26)).join("");
  return `blindboxai_pro_${suffix}`;
}

export async function createProCheckout({ user, store, stripe, env = process.env }) {
  const config = proStripeConfig(env, { checkout: true });
  await store.version();
  await store.rateLimit(user.id, "checkout", 10, 60);
  await Promise.all([inspectProPrice(stripe, config), inspectProDelivery(stripe, env, config)]);
  let account = await store.account(user.id, config.live);
  if (account?.risk_hold) throw new ProError("billing_review_required", 409);
  if (account?.stripe_customer_id) {
    const subscriptions = await stripe.subscriptions.list({ customer: account.stripe_customer_id, status: "all", limit: 100 });
    if (subscriptions.has_more || subscriptions.data.some(sub => !["canceled", "incomplete_expired"].includes(sub.status))) throw new ProError("manage_existing_subscription", 409);
    if (account.checkout_session_id) {
      const previous = await stripe.checkout.sessions.retrieve(account.checkout_session_id);
      if (stripeId(previous.customer) !== account.stripe_customer_id || previous.livemode !== config.live) throw new ProError("checkout_conflict", 409);
      if (previous.status === "complete") throw new ProError("payment_confirmation_pending", 409);
      if (previous.status === "open" && previous.expires_at * 1000 > Date.now()) return checkoutResponse(previous, account.stripe_customer_id, config);
      if (previous.status !== "expired") throw new ProError("checkout_conflict", 409);
    }
  }
  account = await store.claimCheckout(user.id, config.live);
  if (!account?.checkout_attempt_id || account.blocked || account.risk_hold) throw new ProError("checkout_conflict", 409);
  let customerId = account.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { integration: PRO_INTEGRATION } }, { idempotencyKey: `bbai-pro-customer-${config.live}-${user.id}` });
    if (customer.livemode !== config.live || !/^cus_/.test(customer.id)) throw new ProError("checkout_conflict", 409);
    await store.bindCustomer(user.id, config.live, customer.id);
    customerId = customer.id;
  }
  const attemptId = account.checkout_attempt_id;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription", customer: customerId,
    line_items: [{ price: config.price, quantity: 1 }],
    subscription_data: { billing_mode: { type: "flexible" }, metadata: { integration: PRO_INTEGRATION } },
    metadata: { integration: PRO_INTEGRATION },
    integration_identifier: checkoutIntegrationId(attemptId),
    success_url: `${config.origin}/pro/account?checkout=returned`, cancel_url: `${config.origin}/pro/account?checkout=canceled`,
    // Keep the parameters stable for idempotent retries while leaving Stripe's
    // required 30-minute minimum even near the end of the 29-minute claim lease.
    expires_at: Math.floor(new Date(account.checkout_attempt_created_at).getTime() / 1000) + 3600,
    billing_address_collection: "required",
    ...(config.automaticTax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" } } : {}),
  }, { idempotencyKey: `bbai-pro-checkout-${config.live}-${attemptId}` });
  const result = checkoutResponse(session, customerId, config);
  await store.saveCheckout(user.id, config.live, attemptId, session);
  return result;
}

function checkoutResponse(session, customerId, config) {
  let url;
  try { url = new URL(session.url); } catch { throw new ProError("checkout_unavailable"); }
  if (session.mode !== "subscription" || session.livemode !== config.live || stripeId(session.customer) !== customerId ||
      session.status !== "open" || session.expires_at * 1000 <= Date.now() ||
      url.origin !== "https://checkout.stripe.com" || url.username || url.password) throw new ProError("checkout_unavailable");
  return { url: url.toString() };
}
