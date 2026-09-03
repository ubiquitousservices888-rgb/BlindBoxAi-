# Affiliate revenue dashboard

The private owner dashboard separates observed first-party click events from network-reported orders and earnings.

## eBay EPN

Existing BlindBoxAI outbound click events remain the source for click activity. Orders, earnings, conversion rate, and EPC must not be inferred from clicks. Until an authenticated EPN reporting feed is configured, the dashboard displays `Reporting not connected` rather than zero dollars.

When EPN reporting is connected, map network-reported transactions to existing campaign/custom ID attribution and calculate:

- orders: qualifying network-reported transactions
- earnings: confirmed network-reported commission
- conversion rate: qualifying orders / attributable clicks
- EPC: confirmed earnings / attributable clicks

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
