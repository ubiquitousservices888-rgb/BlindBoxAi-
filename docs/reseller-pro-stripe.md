# Reseller Pro subscription pipeline

**Documentation status: ACTIVE SPECIALIST — deployed code; paid checkout disabled.**

Scope: BlindBoxAI's existing Next.js app, Vercel project and dedicated Supabase project. This is the single Pro subscription implementation. It incorporates the safety contract from draft PR #298; do not independently merge that older test-only branch over this implementation. Other open publishing, research and digital-guide PRs are separate work. Shared `package.json` and current-state edits must be merged from current main without replacing unrelated entries.

## Verified starting point

On November 15, 2026 the connected Stripe account exposed one active BlindBoxAI Pro price: `price_1UKettEMF0eSPWJdNZYtb7sr`, product `prod_VLLaWLVDl8Nmoa`, lookup key `blindboxai_pro_monthly`, USD 999 cents/month. This public identifier is not a credential. The code pins this existing live identity rather than creating another product or price. The free waitlist's former $9 pricing hypothesis is superseded by the verified catalog price; no paying customer or revenue is implied.

The two inspected existing Stripe webhooks serve other projects. They are untouched. No BlindBoxAI webhook existed at inspection. Both legacy endpoints subscribe to Checkout completion, so account-wide event fanout still requires a receiver-ownership and fulfillment review before live Pro activation. A dedicated Pro customer mapping protects this implementation; it does not establish that legacy receivers ignore Pro events. Production Vercel settings had the existing Supabase server credentials, but no Pro Stripe or customer-auth publishable settings. The existing database had no Pro payment tables. **A local test is not provider test-mode verification, deployment, account approval, or financial evidence.**

Before payment architecture changes, the exact test from #298 failed with `MISSING: server-side Stripe Checkout endpoint`. A disposable Next/Stripe-fixture journey returned checkout HTTP 404 instead of the required disabled HTTP 503, with zero fixture Stripe writes and zero production requests. Those baseline logs are retained with the implementation work.

## November 16 live preparation snapshot

The owner's instruction to proceed in live mode supersedes the earlier sandbox
connection request for this release. It does not waive credential security,
customer authentication, event signatures, tax review or truthful financial
reporting. No live purchase, refund or artificial risk event was submitted.

- PR #330 is marked merged as `7a10d1ca7f7f1065c22f7bfd490bf8bf0a587bed`.
  Its tree is exactly the tested `3e55a785a20271eca1aa2adb3412f0490abc468f`
  tree `109b2fd4b34549ab68035c164b09fe29fa600770`. Release-gate run
  `43812131115` passed, including 19 Pro tests and all four browser journeys.
- The existing Vercel project now has production deployment
  `dpl_4ad77FgUoLjZDgjQcVXN2Y1tSRVJ` at that tested revision. The public
  `/api/health`, `/pro` and `/pro/account` returned HTTP 200. The free waitlist
  remains present and the paid account CTA remains absent. Unauthenticated
  access/owner checks deny access; checkout returns HTTP 503 while unconfigured.
- The reviewed migration is applied to the existing Supabase project. The
  provider initially recorded generated version `20261116123017`; that one
  newly created history row was aligned to the committed `20261116042308`
  after matching its SQL hash. No SQL or existing migration was replaced, and
  the migration must not be reapplied. Five Pro tables have RLS, no anonymous
  or authenticated direct privileges, and server privileges. All eight Pro
  functions are security invoker and executable only by the server role.
- Live portal `bpc_1UcOuYEMF0eSPWJdopcm33aO` has Pro integration metadata,
  payment-method updates and period-end cancellation, with plan switching off.
  No portal configuration existed before creation; Stripe marked this first
  configuration as default. This app always supplies its exact configuration ID.
- Live webhook `we_1UcPcoEMF0eSPWJds58ytRqH` has the exact Pro URL, required
  events, integration metadata and API version. It is **disabled** until the
  runtime key and remaining launch checks are complete. Its signing secret was
  transferred directly into a sensitive production variable without exposure.
  Both older webhook URLs, versions, event lists and enabled states are unchanged.
- Production settings now include the same project's publishable auth key,
  Pro origin/mode, verified schema version, owner live approval, portal ID and
  webhook settings. Checkout and auth-email-ready flags remain false. Settings
  written after the first deployment are not yet present in that deployment;
  redeploy after final credential/configuration setup.

The remaining blockers are a restricted server Stripe key, real confirmation and
recovery email/callback verification, a merchant tax decision (the existing price
still has unspecified tax behavior), and the ownership/product filters of legacy
Checkout receivers. The portal/schema/webhook objects alone do not prove working
fulfillment. Production Pro account, subscription, payment-event and scenario
counts were all zero at the final readback. No affiliate income is inferred.

Release preparation observed a disagreement between the marked PR merge and
branch-ref reads. Canonical branch alignment must use the repository's protected
PR route with matching checks; never force a ref or introduce another Pro flow.

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

### Manual risk-hold reconciliation

There is no public or customer-operated hold-clear endpoint. An authorized owner
must inspect the exact Stripe Customer, related refund/dispute/fraud cases and
current subscription/invoice first. Do not clear a hold merely because a newer
`invoice.paid` arrived. Retain the case IDs and owner decision in the private
operations record. Only after that review, use the existing restricted database
administration workflow with an exact customer and mode. Example placeholders:

```sql
begin;
select user_id, livemode, stripe_customer_id, risk_hold
from public.pro_accounts
where user_id = '00000000-0000-0000-0000-000000000000'
  and livemode = false and stripe_customer_id = 'cus_REPLACE_EXACT_CUSTOMER'
for update;
-- Continue only after confirming exactly the intended account and provider case.
update public.pro_accounts set risk_hold = false
where user_id = '00000000-0000-0000-0000-000000000000'
  and livemode = false and stripe_customer_id = 'cus_REPLACE_EXACT_CUSTOMER'
  and risk_hold = true
returning user_id, livemode, risk_hold;
commit;
```

Do not run this template unchanged, edit payment events, change subscription
ownership or clear all accounts. A cleared hold still does not grant access:
the signed paid-period mapping and current Stripe checks must pass independently.

### Independent-review decisions

The retained source contracts are supplemented by actual disabled-storefront
browser coverage and the real success-return URL check in
`tests/pro-next.integration.mjs`; source regexes alone are not fulfillment proof.
Sign-out clears this app's local cookies independently of database/rate-limit
availability. Recovery failures return to the account screen, and authentication
provider failures remain service errors rather than invalid-password claims.

An elapsed timestamp with a provider session still marked `open` is deliberately
held until Stripe confirms expiration; it cannot authorize another checkout.
The disposable test verifies no new session is created in that state. Likewise,
unexpected errors log only allowlisted operation/category labels: raw provider
messages, stacks, URLs and bodies are deliberately excluded because they can
contain secrets or customer data. Owner readiness reports each check separately;
`null` means a provider check could not run, not that it failed.

## Activation dependencies

Keep `PRO_PAYMENTS_ENABLED=false` until all of the following are evidenced:

1. Protected-path review and exact-head CI pass. Verify production history contains migration `20261116042308` and read back its Pro schema/RLS/privileges. It was already applied in the November 16 snapshot: **do not reapply it**. Apply reviewed file `20261116042308_reseller_pro_stripe_pipeline.sql` through the established migration process only in an environment where both its history entry and Pro objects are absent. If either exists without the other, stop and reconcile identity rather than recreating tables. The migration creates only `pro_*` tables/functions, enables RLS, denies anonymous/authenticated direct access and grants the server role. Functions are security invoker. Disposable PGlite tests execute the actual SQL, including role denial, atomic claims and tenant isolation; production readback remains separate evidence.
2. Configure server-only `SUPABASE_PUBLISHABLE_KEY` for the same existing project. Preserve the current Supabase URL and service-role credential. Add the exact Pro confirmation/recovery callback URL to the existing Auth redirect allowlist without replacing current entries. Verify real confirmation, sign-in, sign-out, refresh and password recovery. Production SMTP/deliverability must be confirmed; the built-in development sender is not a production-delivery claim. Only then set `PRO_AUTH_EMAIL_READY=true`.
3. The owner chose live preparation on November 16, superseding the earlier sandbox connection request for this release. Keep existing disposable tests as technical evidence, not provider payment evidence. Verify private configuration and real customer authentication before advertising checkout. Verify fulfillment after a genuine consenting purchaser uses the published price; do not manufacture live charges, refunds, disputes or fraud events. Leave financial results UNVERIFIED until authoritative provider evidence exists. An isolated sandbox remains available for future provider simulations when connected.
4. For live operation, use a restricted key with customer read/write, Checkout read/write, subscription/price/invoice/charge/PaymentIntent reads, webhook endpoint read, and customer portal configuration read/session write. Store it as sensitive `PRO_STRIPE_SECRET_KEY`; never paste it into chat or commit it. No app-side catalog creation or modification permission is needed.
5. Configure one Pro-only endpoint at `https://blindboxai.com/api/pro/webhook` with API version `2026-10-28.endive`, the required event list, and `metadata.integration=blindboxai_pro_v1`. Keep its signing secret in `PRO_STRIPE_WEBHOOK_SECRET` and ID in `PRO_STRIPE_WEBHOOK_ENDPOINT_ID`. Do not reuse or edit another project's endpoint. Inspect existing endpoints first to avoid duplicates. Confirm the owner and event/product filters of every legacy Checkout receiver before live activation; do not silently disable or rewrite another project's infrastructure to resolve event fanout.
6. Reuse/create one dedicated Pro portal configuration with matching integration metadata, cancellation enabled at period end, payment-method update enabled, and subscription updates disabled. Store only its ID in `PRO_STRIPE_PORTAL_CONFIGURATION_ID`. Never replace the account's default configuration for other projects.
7. Complete the merchant's tax review. `PRO_TAX_CONFIGURATION=manual-reviewed` requires an actual merchant decision about tax obligations/collection outside automatic tax. `stripe-tax-registered` enables automatic tax only after an active registration and inclusive/exclusive price tax behavior are verified. No tax setting, registration or paid tax feature is activated by this code. Do not assert tax collection merely because a flag exists.
8. Keep new checkout off while deploying the runtime key, webhook signing secret and reviewed auth/tax configuration. After the preceding launch checks and legacy-receiver review pass, enable only Pro endpoint `we_1UcPcoEMF0eSPWJds58ytRqH`. Read it back and verify its enabled status, exact URL, API version, event list and Pro metadata; verify the deployed receiver rejects an invalid signature without writing payment data. Do not change either legacy endpoint. The owner readiness endpoint must report schema/price/delivery checks true; its configuration check can remain false while checkout is deliberately off. Then set `PRO_STRIPE_MODE=live`, `PRO_SCHEMA_VERSION=1`, `PRO_LIVE_BILLING_APPROVED=true` and finally `PRO_PAYMENTS_ENABLED=true` after owner launch authorization, redeploy, and verify full owner readiness. Live mode always reuses the pinned existing Pro price/product. Preview/test credentials must stay separate from production. The optional loopback fixture overrides require an explicitly isolated test runtime and are never production provider alternatives.

The storefront and account availability checks read current provider price,
webhook/portal configuration and schema readiness before offering enrollment.
The checkout endpoint repeats these checks when creating a session, so a stale
page or setting cannot authorize an unusable or overlapping checkout.

Owner-only `GET /api/owner/pro-status` uses the existing Bearer owner control code and returns missing configuration names plus schema/price/delivery/configuration booleans. It never returns secret values, raw provider errors, transaction data or a revenue claim. Its readiness checks do not themselves test email delivery, make a live charge, or prove fulfillment by Stripe in test mode.

## Verification

`npm run pro:test` runs the retained #298 contract, payment guards, actual SDK requests to disposable HTTP Stripe/Auth/database services, the actual PostgreSQL migration and tenant/role/idempotency/lifecycle tests. It is included in the existing release gate via `qa:unit`, not a second payment workflow.

The existing `qa:e2e` command first runs `tests/pro-next.integration.mjs` against actual built Next HTTP routes and disposable providers, then runs Playwright. `qa/e2e/pro-payments.spec.mjs` exercises customer sign-in/checkout/signed webhook/scenario/export/cancellation on a 390-pixel viewport. External browser network access is blocked; hosted Checkout is explicitly a fixture, with no real card entry or Stripe transaction. The ordinary site remains payment-disabled and its free waitlist is tested separately. No production credentials, marketing emails, affiliate self-clicks, real charges, paid rendering or new scheduler are involved. A local browser sandbox failure must be reported as UNVERIFIED until the browser job passes in CI.
