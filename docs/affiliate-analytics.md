# BlindBoxAI affiliate analytics

## Flows

### eBay EPN

BlindBoxAI series page
→ tracked BlindBoxAI outbound route
→ private click event
→ eBay EPN URL with `customid`
→ EPN reporting

### Amazon Associates

BlindBoxAI accessory page
→ `/api/out/amazon`
→ private click event
→ allowlisted Amazon search URL carrying the BlindBoxAI Associates tag
→ Amazon Associates reporting

The Amazon route accepts only known accessory offer IDs. It does not accept an arbitrary destination URL.

## Attribution

### eBay Custom ID

Each eBay link gets a deterministic Custom ID based on the applicable series, figure, link kind, placement, and attribution data. Use `custom_id` as the join key against eBay Partner Network Performance by Custom ID or transaction reports.

### Amazon offer attribution

Amazon click events are rolled up by:

- provider
- offer ID
- traffic source
- campaign ID

BlindBoxAI does not copy Amazon prices or availability into its own report.

## Stored click fields

Depending on provider, a click event can include:

- timestamp
- provider
- Custom ID
- offer ID/title
- series slug/name
- figure
- link kind
- placement
- source
- campaign ID
- source path

The click event intentionally does not store:

- IP address
- email
- cookies
- account/user ID
- user agent
- referrer

## Local report

With `.env.local` containing the private Blob token:

    npm run affiliate:report

Output:

- `reports/affiliate/click-events.csv`
- `reports/affiliate/affiliate-rollup.csv`
- `reports/affiliate/customid-rollup.csv` (compatibility copy)

Generated CSV reports are gitignored.
