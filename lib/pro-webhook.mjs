import { PRO_EVENTS, ProError, proStripeConfig } from "./pro-config.mjs";
import { currentProSubscription, stripeId } from "./pro-stripe.mjs";

const RISK = new Set(["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"]);

export async function processProWebhook({ raw, signature, stripe, store, env = process.env }) {
  const config = proStripeConfig(env, { webhook: true });
  let event;
  try { event = stripe.webhooks.constructEvent(raw, signature, env.PRO_STRIPE_WEBHOOK_SECRET, 300); }
  catch { throw new ProError("invalid_signature", 400); }
  if (!/^evt_[A-Za-z0-9_]+$/.test(event.id || "") || event.livemode !== config.live || event.account ||
      !Number.isInteger(event.created)) throw new ProError("event_mismatch", 400);
  if (!PRO_EVENTS.includes(event.type)) return { received: true, ignored: true };
  await store.version();
  const object = event.data?.object;
  if (!object?.id) throw new ProError("invalid_event", 400);
  let customerId, subscriptionId, clearCheckout = false;
  if (RISK.has(event.type)) {
    let chargeId = event.type === "charge.refunded" ? object.id : stripeId(object.charge);
    if (!chargeId && stripeId(object.payment_intent)) {
      const intent = await stripe.paymentIntents.retrieve(stripeId(object.payment_intent));
      if (intent.livemode !== config.live) throw new ProError("event_mismatch", 400);
      chargeId = stripeId(intent.latest_charge);
    }
    if (!chargeId) throw new ProError("risk_resolution_required");
    const charge = await stripe.charges.retrieve(chargeId);
    if (charge.livemode !== config.live) throw new ProError("event_mismatch", 400);
    customerId = stripeId(charge.customer);
  } else if (event.type.startsWith("checkout.session.")) {
    const session = await stripe.checkout.sessions.retrieve(object.id);
    if (session.livemode !== config.live) throw new ProError("event_mismatch", 400);
    if (session.mode !== "subscription") return { received: true, ignored: true };
    customerId = stripeId(session.customer);
    subscriptionId = stripeId(session.subscription);
    clearCheckout = session.status === "complete" && session.payment_status === "paid";
  } else if (event.type.startsWith("customer.subscription.")) {
    subscriptionId = object.id;
    customerId = stripeId(object.customer);
  } else {
    const invoice = await stripe.invoices.retrieve(object.id);
    if (invoice.livemode !== config.live) throw new ProError("event_mismatch", 400);
    customerId = stripeId(invoice.customer);
    subscriptionId = stripeId(invoice.parent?.subscription_details?.subscription);
  }
  if (!customerId) return { received: true, ignored: true };
  const account = await store.customer(customerId, config.live);
  // Ownership comes from the server-created customer mapping, never email or
  // untrusted customer/subscription metadata shared by the wider Stripe account.
  if (!account) return { received: true, ignored: true };
  let snapshot = null;
  if (subscriptionId) {
    try { snapshot = await currentProSubscription(stripe, subscriptionId, config); }
    catch (error) { if (error instanceof ProError && error.code === "subscription_mismatch") return { received: true, ignored: true }; throw error; }
    if (snapshot.customer !== account.stripe_customer_id) throw new ProError("subscription_mismatch", 409);
  }
  const result = await store.applyEvent(event, account, snapshot, RISK.has(event.type), clearCheckout);
  return { received: true, duplicate: result === false };
}
