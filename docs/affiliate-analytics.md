# BlindBoxAI affiliate analytics

## Flow

BlindBoxAI series page
→ `/api/out/ebay`
→ private click event
→ eBay EPN URL with `customid`
→ EPN reporting

## Custom ID

Each link gets a deterministic Custom ID based on:

- series
- figure
- link kind (`sold` or `active`)
- placement (`series_table`)

No user identifier is included.

## Stored click fields

- timestamp
- Custom ID
- series slug/name
- brand
- figure
- link kind
- placement
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
- `reports/affiliate/customid-rollup.csv`

Use `custom_id` as the join key against eBay Partner
Network Performance by Custom ID or transaction reports.

Generated CSV reports are gitignored.
