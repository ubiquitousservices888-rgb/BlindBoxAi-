# Video-to-revenue funnel implementation contract

Status: **design only**. No publishing, spend, revenue claim, or production code change is authorized by this file. Merging this document cannot be treated as delivering the funnel.

## Code-backed current interfaces (main revision `15432104e24ed10eb21afa8ed570927daf847e82`, inspected 2026-10-14)

Evidence is a read-only GitHub file inspection pinned to the exact `main` commit above; this does **not** verify the currently deployed production version. Reproduce with `git show 15432104e24ed10eb21afa8ed570927daf847e82:<path>` for each path below. The listed blob SHA provides an additional content check.

- `app/page.jsx` (blob `024cd110c166fc0160d04b0af01c4f42280130d6`): `getPublishedVideos()` fetches `published-video-feed`, filters HTTPS videos, slices to six, and renders video cards without item-specific CTAs. It labels **every** returned video `Published` regardless of `status`; this requires remediation before publication claims are trusted.
- `supabase/functions/published-video-feed/index.ts` (blob `ec4ea1fb6e9a19d9423b7c81063a7784e2eec6ba`): `handleFeed()` selects `research_run_id,title,vertical,video_url,channels,campaign_id,status,published_at`; it includes both `partial` and `published`.
- `app/api/out/ebay/route.js` (blob `1fe554dbb0bf7e73f333b2b44d8b411315af911e`): `HEAD` resolves a first-party destination without logging a click; `GET` redirects and schedules Supabase click telemetry. Never use `GET` for read-only QA.
- `lib/ebay-outbound-readonly.mjs` (blob `3363e5a492172d6a49d8a667af0204d39529bdbf`): `VALID_PLACEMENTS` is **only** `series_table`; the resolver rejects `placement=video_card` with 400.
- `lib/data.js` (blob `ec462d6325bcd66e1ae4e9a69c26bf4c18c91abe`): `ebayOutboundPath()` always emits `placement=series_table`, and `epnCustomId()` has a 240-character limit with possible truncation of the base fields.
- `lib/campaign-attribution.mjs` (blob `36694a974a05313abb091ade0dfbed1123b643e0`): campaign IDs are validated; source strings are normalized to at most 40 characters. Explicit `source=video_card` can be represented, but this alone does not enable the placement.
- `app/shop/accessories/AmazonAffiliateLink.jsx` (blob `5f964a88b1c96a1290d15244bb2cd00857be8a75`): Amazon accessory click events are submitted to `/api/events/amazon-affiliate-click`. A click beacon is not commission confirmation.

These are repository facts at the pinned revision, **not** end-to-end verification of external channel receipts, provider commissions, or live deployment. The current homepage wording is a known risk when `partial` appears in the feed.

## Implementation gates

1. Extend canonical approved review data with immutable, validated `series_slug` and exact `figure` identity (or equivalent owner-reviewed foreign key), sourced from owner-reviewed research, never inferred from titles or LLM output. No autonomous product selection.
2. Feed only public safe fields and server-generated first-party item URLs. Show an affiliate CTA **only** when an approved item identity resolves to an existing series and exact verified figure. Otherwise link to noncommercial research or show no CTA. Never place raw eBay URLs in video cards.
3. **Fix the incompatible existing attribution implementation before using video cards.** Allow `video_card` in `lib/ebay-outbound-readonly.mjs` only through a validated, explicit placement; extend `lib/data.js` `ebayOutboundPath()` to emit `video_card` for verified video offers while keeping `series_table` unchanged for current callers. Carry validated `research_run_id` (or internally mapped video identifier), `campaign_id`, `source=video_card`, and `placement=video_card` through first-party landing, outbound handling, and click events. The existing outbound event schema has no video ID; add one with validated canonical lookup so events can be joined without free-form identifiers or PII. The provider Custom ID and stored click event must have consistent campaign/item attribution; reject overlong or collision-prone identifiers rather than silently truncating distinct identities. Update relevant attribution allowlists and add an explicit `video_card` regression test; **today that placement returns 400**.
4. Separate `partial` from `published` in the homepage feed and all public copy. Never call a video externally published without verified public channel URLs/receipts. Preserve correct per-channel state.
5. Record aggregate video impressions, CTA clicks, qualified outbound clicks, and attributed orders/commission **separately**, with timestamps, campaign, canonical video ID, channel, and verified item identity. Require idempotent events and provider IDs for order/commission deduplication. No user-level profiling.
6. Owner dashboard: views → CTA clicks → validated outbound clicks → provider-confirmed transactions → net commission/revenue per campaign/video; display data gaps, reconciliation status, and provider report lag. EPN/Amazon reports may be unavailable: label revenue `UNVERIFIED`, not zero. Never infer commission or an order from clicks.
7. Regression tests: unmatched video title has no monetized CTA; mismatched series/figure fails closed; invalid campaign/video ID rejected; `video_card` outbound HEAD resolves while invalid placements reject; legacy `series_table` still works; custom ID correlates with a click event without collisions; `partial` is never labeled published; `HEAD` creates no click event; no Blue approval bypass; no duplicate channel publishing; no secrets/PII in telemetry.
8. Implement in **separate scoped production PR(s)** after reconciling outstanding P1 approval-state regression and duplicate-publishing risks. Require fresh CI, independent review, owner-authorized Blue approval, and a verified deployment before calling this live. Do not enable new external publishing, trigger paid rendering, or alter production data solely to validate the design.

## Acceptance evidence

- Implementation PR diff, regression test logs, CI run IDs, and independent review verdict.
- Deployed SHA, live HTTP page, canonical video-to-item mapping, and sanitized HEAD redirect location (no outbound GET used for QA).
- Owner-authorized Blue approval and externally verified channel receipts.
- Correlated video impression → CTA → outbound click events with valid campaign/Custom ID and without secrets or PII.
- Reconciled provider-confirmed commission or an explicit `not yet verified` status.

This design does not establish actual conversion, earnings, or live funnel implementation.
