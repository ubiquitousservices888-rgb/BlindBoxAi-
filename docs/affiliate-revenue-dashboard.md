# Affiliate revenue dashboard

**Documentation status: ACTIVE SPECIALIST** — report import and owner revenue display. Deployment and live provider reconciliation require separate evidence.

The private owner dashboard separates observed first-party click events from network-reported orders and earnings.

## eBay EPN

Existing BlindBoxAI outbound click events remain the source for click activity. Orders, earnings, conversion rate, and EPC must not be inferred from clicks. Until an authenticated EPN reporting feed is configured, the dashboard displays `Reporting not connected` rather than zero dollars.

When EPN reporting is connected, map network-reported transactions to existing campaign/custom ID attribution and calculate:

- orders: qualifying network-reported transactions
- earnings: confirmed network-reported commission
- conversion rate: qualifying orders / attributable clicks
- EPC: confirmed earnings / attributable clicks

The CSV importer emits `verificationVersion: 1`. Only positive USD commissions with an explicit approved/confirmed status, a transaction ID, and a recognized BlindBoxAI Custom ID can create eligible revenue evidence. Recognized IDs include `bb-rv-`/`bb-ch-`, the actual `bb1s…` versioned format from `epnCustomId`, and canonical `vertical.source.item` IDs from `buildCustomId`. Existing outbound IDs are preserved; generator-to-importer round-trip tests cover long, suffix-preserving IDs. Recognizing an app namespace is not proof of a per-click or per-video attribution join.

Summary-only reports and unattributed rows cannot create revenue. Identical exported rows are deduplicated; distinct item rows within a transaction aggregate. Pending, reversed, and status-less rows do not increase confirmed click counts. Dated zero-revenue clicks remain in daily activity. `dataThrough` records the last dated matched provider activity; `importedAt` never substitutes for that date. Missing order columns remain unavailable. Legacy dashboard report totals and daily earnings are withheld until reimported through this gate.

Conflicting Custom IDs, lifecycle states, or negative adjustments withhold the affected transaction and set `reconciliationRequired`. Eligible commissions are not net profit or payouts. Import does not reconcile reversals against previously stored immutable conversion evidence; do not train or scale an optimizer from that historical ledger until reconciliation is independently verified. Legacy reports without the verification version must be reimported before a coordinator trusts their revenue.

## Amazon Associates

Amazon affiliate links can be active before Creators API/reporting access is approved. Until authenticated reporting is available, the dashboard displays `Affiliate links active; reporting pending Amazon approval` and does not invent orders or earnings.

Once Amazon reporting access is approved, ingest only authenticated network-reported data and expose Amazon clicks/orders/earnings separately from eBay.

## Safety

- Never store affiliate API secrets in source control.
- Never expose owner authentication or affiliate credentials to the browser.
- Never represent missing reporting as `$0`.
- Preserve the existing owner-authentication gate.
- Preserve the existing owner approval gate for publishing.
- Public social/video CTA remains BlindBoxAI.com.

## Official EPN Transaction Detail API (owner-only, read-only)

The official documented report resource is `https://api.partner.ebay.com/Mediapartners/{Account_SID}/Reports/ebay_partner_transaction_detail.csv`. The Account SID and EPN Auth Token are distinct from the eBay Developer Program OAuth client credentials. The API fetcher `lib/epn-tdr-api.mjs` uses HTTPS and HTTP Basic authentication **in an Authorization header only**. The Account SID is required as a path identifier; the Auth Token is never placed in a URL or logged, and neither credential is printed by application code. It requests `DATE_TYPE=update_date`, `STATUS=ALL` and a bounded 35-day UTC lookback so pending, approved and reversed transactions can be evaluated together. EPN documentation describes adjustments occurring within 30 days; this window is not proof against all historical corrections.

Only an owner-authorized live read `GET /api/owner/epn-tdr` may return report aggregates. It requires the existing Bearer owner control code and the server-only `EPN_ACCOUNT_SID`, `EPN_REPORTING_ACCESS_TOKEN`, and `EPN_REPORTING_CURRENCY=USD` settings. A successful response reports `persisted:false` and `verifiedProviderPayout:false`; it does **not** write conversion evidence, private Vercel Blob reports, or a website revenue total. The existing owner-authenticated CSV import remains the independent, write-capable path; it is not called by the TDR reader. A report containing reversals is flagged for manual historical reconciliation before any new persistence or financial optimization.

The main-only `.github/workflows/epn-tdr-readonly.yml` is a **manual read-only diagnostic**, with the same credentials configured as GitHub repository secrets plus `EPN_REPORTING_CURRENCY=USD` as a repository variable. Because GitHub Actions logs for this public repository may be visible to anyone, it logs only non-sensitive pass/fail, report type, and read-only safety-status metadata, never private transaction identifiers, financial figures, raw CSV, credentials, or credential-bearing URLs. No scheduled import, paid integration, affiliate outbound click, auto-post, database mutation, or revenue confirmation is introduced. Code, tests, and a successful build do not establish live EPN account credentials or report access.

Official provider references: [EPN Transaction Detail Report API specification](https://ir.ebaystatic.com/cr/v/c1/EPN/Transaction%20Detail%20Report%20%28TDR%29%20API%20Doc%20July%202020.pdf) and [EPN transaction report explanation](https://partnernetwork.ebay.com/solutions/understanding-the-transaction-detail-report-tdr).
