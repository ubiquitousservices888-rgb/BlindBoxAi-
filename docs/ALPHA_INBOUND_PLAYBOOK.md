# BlindBoxAI inbound alpha acquisition — October 2026

## Job and safety boundary
Turn useful public collectible research into voluntary **stored reseller waitlist submissions**, then validate genuine demand with separately consenting participants. The current signup validates email syntax but **does not** verify email ownership, actual product interest, or qualification. Do not call signups verified, qualified customers, beta invites, purchases, or revenue.

Do not automate unsolicited DMs/emails, mass posting, spending, partner applications, or unreviewed content publication. Keep EPN/Amazon disclosure and owned-domain destination rules unchanged.

## Live vs proposed functionality
- **On merge and successful deploy:** /pro opt-in landing using the existing server-only Supabase waitlist, existing attribution, privacy notice, and browser-local resale calculator.
- **Discoverable tool:** /tools/resale-margin, included in sitemap and linked from the home page, estimates net profit, sale break-even, and a maximum purchase price for a target profit based on user-entered costs.
- **Current public experience:** reviewed completed-sale evidence and Mr. Know It All at /ask where evidence is available; missing facts remain explicitly missing.
- **Not live:** email ownership verification, alpha invitations, paid subscriptions, alerts, bulk valuation, CSV export, and saved collections. $9/month is only a proposed price, not recurring revenue.

## The human decision gap
A price-listing comparison is not enough. A buyer needs (1) actual comparable completed transactions; (2) evidence freshness; (3) acquisition and selling friction; (4) return, fraud, authenticity and condition risk; and (5) a defensible maximum bid or a reason to pass. Don't claim this is more accurate than a competitor unless directly verified.

## First-party acquisition loop
1. Publish a useful, owner-reviewed collectible question or comparison with dated evidence and visible uncertainty.
2. Link to the relevant BlindBoxAI page from allowed Pinterest, YouTube, TikTok and X content, with owned-domain UTM tags; never distribute raw eBay EPN links.
3. Invite visitors to a genuinely free calculator at /tools/resale-margin and an optional waitlist at /pro. Neither signup nor alpha access is guaranteed by a click.
4. Measure separate signals: consented analytics visits, server-stored unverified waitlist records, attributed outbound affiliate clicks, and provider-confirmed sales/revenue. **Clicks and waitlist records are not sales.**
5. Use counts of stored submissions by source only for descriptive comparisons. **Existing owner analytics do not provide a source-by-source signup breakdown.** Do not mislabel their landing-source chart as signup-source data.
6. Never compute a full-site conversion rate by dividing all stored waitlist emails by only analytics-consenting visitors. Visitor analytics are a consented subset and useful only as directional traffic signals.

## Owner-authorized source breakdown — not deployed into the public API
Run the following **aggregate-only** read-only query inside the project owner's Supabase SQL editor when comparing stored submission sources. It uses the existing server-only `public.waitlist_signups` table; do not expose it publicly or return emails.

```sql
SELECT
  COALESCE(NULLIF(source, ''), 'direct') AS source,
  COALESCE(NULLIF(campaign, ''), NULLIF(utm_campaign, ''), 'unattributed') AS campaign,
  COUNT(*) AS stored_unverified_submissions
FROM public.waitlist_signups
WHERE COALESCE(source, '') <> 'owner_test'
GROUP BY 1, 2
ORDER BY stored_unverified_submissions DESC;
```

This reports unique stored email rows by source/campaign because email is unique; it **cannot** prove deliverability, human identity, qualification, or willingness to pay. Do not join this PII table to public analytics. When the user wants a verified cohort, implement a consent-aware double-opt-in and separate qualification workflow before making that claim.

## Reviewable distribution copy
“Before reselling a collectible, compare completed-sale evidence and estimate the real margin after fees and shipping. Free browser-based calculator: https://www.blindboxai.com/tools/resale-margin?utm_source=owned_social&utm_medium=organic&utm_campaign=alpha_launch_202610. You can also join the optional reseller tools waitlist. There is no guarantee of alpha entry.”

## First 30 days, with no fabricated forecasts
- Week 1: verify deployed pages and that a legitimate owner-approved test signup can be stored; examine privacy and opt-in wording. Do not use fake signups in production KPI calculations.
- Week 2: review and distribute a small number of genuinely useful buyer-intent comparisons linking to the calculator.
- Week 3: compare allowed owned-domain links across an owner-reviewed Pinterest/YouTube/TikTok/X pilot. Preserve native platform and affiliate policies.
- Week 4: review aggregated **stored submissions by source** using the authorized SQL query above, alongside separately reported consenting traffic trends and EPN results. **Do not mix cohorts into an apparent conversion rate.** Arrange interviews only with people who separately consented to product research.

## Commercial release gate
Do not activate billing based on waitlist volume alone. First establish repeat usage, show that the tool changes a buyer decision, then test willingness to pay for alerts/batch exports/collection tracking. Current $9/month is a pricing hypothesis. All payments, enrollment, and marketing outreach require separately appropriate authorization and disclosures.

Maintain existing GitHub review, security CI, owner Blue video approvals, and Vercel production controls.
