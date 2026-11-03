# EPN live verification and daily reconciliation (separate from PR #299)

**Documentation status: ACTIVE SPECIALIST** — implementation in review; scheduled sync remains disabled.\n\nStatus: **REVIEW ONLY / AUTOMATION DISABLED** until the owner independently
verifies a live EPN report and reviews the reporting account's USD currency.

## Step 1 — Verify live EPN provider evidence on a phone

Open https://blindboxai.com/owner-dashboard/revenue and unlock the owner
dashboard using the existing private owner code. Press
**Verify live eBay report (read-only)**. This uses the merged PR #299 server-side
EPN credentials, never exposes the credentials to the browser, and does not
write financial records.

A successful provider response identifies the report type and displays the
count of unique approved BlindBoxAI transactions, eligible commissions in the
specified 35-day update window, pending/reversed rows, and a reconciliation
warning. A green build, connected OAuth, or a configured `USD` value alone
cannot establish successful live provider access, currency, sales or payouts.

## Step 2 — Review the separate daily sync

The optional Vercel Cron route is `/api/cron/epn-sync`, UTC noon each day.
It is **disabled unless all of the following are verified and explicitly set**:

- A cryptographically strong, private production `CRON_SECRET` (at least 16 characters).
  Vercel sends this in the Authorization Bearer header for scheduled invocations.
- Private `EPN_ACCOUNT_SID` and `EPN_REPORTING_ACCESS_TOKEN` in Production.
- `EPN_REPORTING_CURRENCY=USD`, only after verifying the eBay account currency.
- `EPN_AUTO_SYNC_ENABLED=true` in Production, added **only after** owner review
  and an authenticated successful live report check.

Do not add `CRON_SECRET` to GitHub, public files or chat. Do not disable owner
authentication or expand seller-account eBay scopes. Do not enable automatically
because a credential exists. A cron call while disabled returns 503 without
making any external EPN request or writing any report.

## How daily reconciliation works

- Each run fetches the official authenticated Transaction Detail Report with
  `STATUS=ALL` and a rolling 35-day **update-date** window.
- Only positive, explicitly approved/confirmed rows with accepted BlindBoxAI
  Custom IDs and unique eBay transaction IDs can contribute to eligible totals.
- Distinct item rows with the same transaction ID aggregate; repeat identical
  rows never increase the total twice.
- A single private Blob snapshot at `owner/epn-live/latest.json` is replaced;
  **prior amounts are never incremented**.
- Conflicting statuses, negative adjustments or reversals withhold all financial
  totals until historical reconciliation, rather than continuing to show an
  older optimistic amount. Empty, malformed, partially parsed, or missing-transaction-ID provider responses do not save. An empty report is not treated as a verified zero without independent provider proof.
- Dashboard totals become unavailable when a live snapshot is over 48 hours old.
  A live snapshot takes precedence over earlier CSV imports, including if stale
  or blocked. There is never a fallback that revives older totals.
- We intentionally do NOT append EPN data to the existing immutable
  `provider_conversion_evidence` table. That table cannot automatically
  reverse previously stored conversions.
- No raw CSV, transaction IDs, buyer data, secrets, or payout data are persisted
  by this path. The owner verification button is read-only and independent of
  the daily sync.

## Strict financial scope

This is **not lifetime earnings or payout tracking**. Each snapshot represents
the latest 35-day update window, not cumulative lifetime commissions. Historic
reversals outside this interval are not covered. Do not infer all-time earnings,
net profit, bank payments or historical conversion counts from the window.
Historic evidence in the immutable table remains separate and must not be added
to these totals.

The process is designed to avoid double counting within the rolling live report
and to withhold numbers when detected corrections need reconciliation. It cannot
prove no older reversal exists.

## Verification gate

Before activation:

1. Independent code review, green exact-head tests, and approved PR merge.
2. Vercel Production READY on the merge SHA.
3. Owner presses read-only live check and confirms authentic report access,
   correct account/currency and data window.
4. Confirm privacy controls and policy compliance; set CRON_SECRET and
   EPN_AUTO_SYNC_ENABLED only after approval and a proven provider report.
5. Independently inspect the first automatic run and its private owner dashboard
   totals. Compare dates, transaction counts and approved commission totals to
   the authenticated EPN Transaction Detail Report. If it differs, disable.
6. Keep deployment/production state separate from verified network conversion,
   reconciliation and payout evidence.

Official reference: https://partnernetwork.ebay.com/solutions/understanding-the-transaction-detail-report-tdr
