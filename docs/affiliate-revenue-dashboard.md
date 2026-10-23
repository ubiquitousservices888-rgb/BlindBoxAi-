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
