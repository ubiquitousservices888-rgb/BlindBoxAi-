import { ProError, proStripeConfig } from "./pro-config.mjs";
import { currentProSubscription } from "./pro-stripe.mjs";

// A browser redirect, user metadata, or a Stripe customer ID alone grants nothing.
// A signed webhook must first persist the ownership/subscription mapping. Current
// provider state is then re-read, so an old event cannot restore canceled access.
export async function resolveProEntitlement({ userId, store, stripe, env = process.env }) {
  const config = proStripeConfig(env);
  const account = await store.account(userId, config.live);
  if (!account?.stripe_customer_id) return { allowed: false, reason: "subscription_required" };
  if (account.risk_hold) return { allowed: false, reason: "billing_review_required", billingAvailable: true };
  const rows = await store.subscriptions(userId, config.live);
  if (rows.length > 8) return { allowed: false, reason: "billing_review_required", billingAvailable: true };
  const eligible = [];
  for (const row of rows) {
    if (row.price_id !== config.price) continue;
    const snapshot = await currentProSubscription(stripe, row.subscription_id, config);
    if (snapshot.customer !== account.stripe_customer_id) throw new ProError("subscription_mismatch", 409);
    if (snapshot.currentPaid && row.paid_through && Date.parse(row.paid_through) > Date.now()) eligible.push(snapshot);
  }
  if (eligible.length !== 1) return { allowed: false, reason: eligible.length > 1 ? "billing_review_required" : "subscription_required", billingAvailable: true };
  return { allowed: true, paidThrough: eligible[0].paid_through, cancelAtPeriodEnd: eligible[0].cancelAtPeriodEnd, billingAvailable: true };
}

export async function requireProEntitlement(options) {
  const access = await resolveProEntitlement(options);
  if (!access.allowed) throw new ProError(access.reason, 402);
  return access;
}
