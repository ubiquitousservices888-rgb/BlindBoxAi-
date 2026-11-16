# Reseller Pro subscription pipeline

**Documentation status: ACTIVE SPECIALIST — implementation under review.**

Scope: BlindBoxAI's existing Next.js app, Vercel project and dedicated Supabase project. This is the single Pro subscription implementation. It incorporates the safety contract from draft PR #298; do not independently merge that older test-only branch over this implementation. Other open publishing, research and digital-guide PRs are separate work. Shared `package.json` and current-state edits must be merged from current main without replacing unrelated entries.

## Verified starting point

On November 15, 2026 the connected Stripe account exposed one active BlindBoxAI Pro price: `price_1UKettEMF0eSPWJdNZYtb7sr`, product `prod_VLLaWLVDl8Nmoa`, lookup key `blindboxai_pro_monthly`, USD 999 cents/month. This public identifier is not a credential. The code pins this existing live identity rather than creating another product or price. The free waitlist's former $9 pricing hypothesis is superseded by the verified catalog price; no paying customer or revenue is implied.

The two inspected existing Stripe webhooks serve other projects. They are untouched. No BlindBoxAI webhook existed at inspection. Production Vercel settings had the existing Supabase server credentials, but no Pro Stripe or customer-auth publishable settings. The existing database had no Pro payment tables. **A local test is not provider test-mode verification, deployment, account approval, or financial evidence.**

Before payment architecture changes, the exact test from #298 failed with `MISSING: server-side Stripe Checkout endpoint`. A disposable Next/Stripe-fixture journey returned checkout HTTP 404 instead of the required disabled HTTP 503, with zero fixture Stripe writes and zero production requests. Those baseline logs are retained with the implementation work.

## Customer flow

1. `/pro` keeps the existing free calculator and independent free waitlist. A Pro account link appears only with the explicit checkout configuration. The page is dynamic so a stale build cannot advertise an old switch state.
2. `/pro/account` creates/confirms an email account or signs in through the existing Supabase Auth service. PKCE confirmation and recovery links return to `/api/pro/auth/callback`; tokens stay in HttpOnly, host-only, SameSite=Lax cookies, Secure on production HTTPS. Every protected request calls provider `getUser`, requires a confirmed nonanonymous user, and derives the owner from that user, never a submitted user ID.
3. Authenticated `POST /api/pro/checkout` creates hosted subscription Checkout for that user's dedicated, durably mapped Stripe customer. The server chooses the price and return URLs. The request body cannot supply a price, customer or user. Database claims and stable Stripe idempotency keys serialize retries. An expired ambiguous submission remains blocked for reconciliation rather than creating another charge attempt.
4. `POST /api/pro/webhook` verifies the raw-body Stripe signature before processing. One atomic PostgreSQL operation deduplicates the event and updates the private ownership/subscription ledger. The success URL grants no access.
5. Access requires a signed-webhook mapping, a locally recorded unexpired paid period, and a fresh matching Stripe subscription/latest invoice. The subscription must be active, USD, correct price/product, quantity one, paid on Stripe, and unpaused. Missing provider/storage evidence fails closed. Multiple eligible subscriptions are held for review.
6. Paid users can save/edit/delete up to 250 private cost scenarios and export CSV. These use the existing resale-margin calculator and user assumptions, not invented valuations. CSV text is protected against spreadsheet formula injection; numeric losses remain numeric. No automatic alerts, market-price feeds or bulk appraisal claims are included.
7. Authenticated `POST /api/pro/portal` uses the mapped customer and a dedicated Pro portal configuration. Customers can update payment methods and cancel at period end. Plan switching is disabled to prevent cross-product enrollment. Account access and billing management do not depend on the new-checkout switch.

`app/cookies/page.jsx` adds the required account, billing, private-scenario and essential-cookie disclosure. This is functional payment/privacy work, not a design refresh. No affiliate route, publishing gate, model, domain, hosting project or existing database table is replaced.

## Required Stripe events

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`
- `charge.refunded`, `charge.dispute.created`, `radar.early_fraud_warning.created`

Unpaid, failed or pending Checkout never grants access. Lifecycle handlers retrieve current provider objects so stale event payloads cannot restore canceled access. Refund/dispute/fraud events resolve the Charge (through PaymentIntent if necessary), then the first-class Stripe Customer ownership boundary. Only a customer mapped by this application's server is actionable; email and metadata are not ownership evidence. A risk event sets a sticky account hold even if it arrives out of order. Later paid events cannot clear it. The owner must reconcile the actual case before clearing a hold; no automatic refund, cancellation, or money transfer occurs here.

The ledger records event IDs and access state, not raw events, card details or passwords. This is not a payout/profit ledger and does not alter `provider_conversion_evidence` or affiliate reporting. Customer email is maintained by Auth/Stripe, not copied into the Pro ledger, so no local email-sync webhook is needed.

## Activation dependencies

Keep `PRO_PAYMENTS_ENABLED=false` until all of the following are evidenced:

1. Protected-path review and exact-head CI pass. Review/apply additive migration `20261116042308_reseller_pro_stripe_pipeline.sql` through the established production migration process. It creates only `pro_*` tables/functions, enables RLS, denies anonymous/authenticated direct access and grants the server service role. Functions are security invoker, not definer. Tests execute the actual SQL against disposable PGlite PostgreSQL, including role denial, atomic claims and tenant isolation. This does not establish a production migration or its history entry.
2. Configure server-only `SUPABASE_PUBLISHABLE_KEY` for the same existing project. Preserve the current Supabase URL and service-role credential. Add the exact Pro confirmation/recovery callback URL to the existing Auth redirect allowlist without replacing current entries. Verify real confirmation, sign-in, sign-out, refresh and password recovery. Production SMTP/deliverability must be confirmed; the built-in development sender is not a production-delivery claim. Only then set `PRO_AUTH_EMAIL_READY=true`.
3. Connect an isolated Stripe sandbox/test-mode account. The current connection exposes only the live account; the implementation's local provider fixtures do not substitute for a Stripe test charge. Configure a matching test Price/Product, restricted API key, signed webhook and dedicated portal. Test successful/failed/delayed payments, renewal, period-end and immediate cancellation, retries, refunds and risk events without real money.
4. For live operation, use a restricted key with customer read/write, Checkout read/write, subscription/price/invoice/charge/PaymentIntent reads, webhook endpoint read, and customer portal configuration read/session write. Store it as sensitive `PRO_STRIPE_SECRET_KEY`; never paste it into chat or commit it. No app-side catalog creation or modification permission is needed.
5. Configure one Pro-only endpoint at `https://blindboxai.com/api/pro/webhook` with API version `2026-10-28.endive`, the required event list, and `metadata.integration=blindboxai_pro_v1`. Keep its signing secret in `PRO_STRIPE_WEBHOOK_SECRET` and ID in `PRO_STRIPE_WEBHOOK_ENDPOINT_ID`. Do not reuse or edit another project's endpoint. Inspect existing endpoints first to avoid duplicates.
6. Reuse/create one dedicated Pro portal configuration with matching integration metadata, cancellation enabled at period end, payment-method update enabled, and subscription updates disabled. Store only its ID in `PRO_STRIPE_PORTAL_CONFIGURATION_ID`. Never replace the account's default configuration for other projects.
7. Complete the merchant's tax review. `PRO_TAX_CONFIGURATION=manual-reviewed` requires an actual merchant decision about tax obligations/collection outside automatic tax. `stripe-tax-registered` enables automatic tax only after an active registration and inclusive/exclusive price tax behavior are verified. No tax setting, registration or paid tax feature is activated by this code. Do not assert tax collection merely because a flag exists.
8. Set `PRO_STRIPE_MODE=live`, `PRO_SCHEMA_VERSION=1`, `PRO_LIVE_BILLING_APPROVED=true` and finally `PRO_PAYMENTS_ENABLED=true` only after the matching prerequisites and owner launch authorization. Live mode always reuses the pinned existing Pro price/product. Preview/test credentials must stay separate from production. The optional loopback fixture overrides require an explicitly isolated test runtime and are never production provider alternatives.

Owner-only `GET /api/owner/pro-status` uses the existing Bearer owner control code and returns missing configuration names plus schema/price/delivery/configuration booleans. It never returns secret values, raw provider errors, transaction data or a revenue claim. Its readiness checks do not themselves test email delivery, make a live charge, or prove fulfillment by Stripe in test mode.

## Verification

`npm run pro:test` runs the retained #298 contract, payment guards, actual SDK requests to disposable HTTP Stripe/Auth/database services, the actual PostgreSQL migration and tenant/role/idempotency/lifecycle tests. It is included in the existing release gate via `qa:unit`, not a second payment workflow.

The existing `qa:e2e` command first runs `tests/pro-next.integration.mjs` against actual built Next HTTP routes and disposable providers, then runs Playwright. `qa/e2e/pro-payments.spec.mjs` exercises customer sign-in/checkout/signed webhook/scenario/export/cancellation on a 390-pixel viewport. External browser network access is blocked; hosted Checkout is explicitly a fixture, with no real card entry or Stripe transaction. The ordinary site remains payment-disabled and its free waitlist is tested separately. No production credentials, marketing emails, affiliate self-clicks, real charges, paid rendering or new scheduler are involved. A local browser sandbox failure must be reported as UNVERIFIED until the browser job passes in CI.
