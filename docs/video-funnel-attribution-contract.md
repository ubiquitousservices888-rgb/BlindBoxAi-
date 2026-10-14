# Video-to-revenue funnel implementation contract

Status: design only. No publishing, spend, or production change authorized by this file.

## Verified current interfaces (main, 2026-10-14)
- Home `app/page.jsx` reads `published-video-feed` and shows up to six videos; cards have no item-specific CTA.
- `published-video-feed` GET selects `research_run_id,title,vertical,video_url,channels,campaign_id,status,published_at`; it includes `partial` and `published`.
- `/api/out/ebay` has a HEAD read-only QA path and GET redirect with Supabase click telemetry; never invoke GET during QA.
- Amazon accessories use `/api/events/amazon-affiliate-click` beacon. Neither click stream proves commission.

## Implementation gates
1. Extend canonical approved review data with an immutable, validated `series_slug` and `figure` identity (or equivalent verified foreign key), sourced from owner-reviewed research, never inferred from titles or LLM output. Do not allow an AI to choose the product mapping autonomously.
2. Feed only public safe fields and a server-generated first-party item URL; only provide a monetized CTA when identity resolves to an existing series and verified matching figure. Otherwise link to research or show no affiliate CTA. Never place raw eBay URLs in video cards.
3. Preserve `research_run_id`, `campaign_id`, `source=video_card`, `placement=video_card` through first-party landing and outbound routes; validate against existing attribution allowlists and avoid truncating unique identifiers. Require a test that confirms custom ID and click event agree without leaking personal data.
4. Separate `partial` from `published` labels. Do not call a video externally published without verified public channel URLs/receipts.
5. Record aggregate video impression, CTA click, outbound click and attributed order/commission separately, with timestamp, campaign, video ID, channel and item identity. Count revenue only from imported provider or Stripe verified reports, not estimated clicks. Deduplicate on provider event IDs. No user-level profiling.
6. Owner dashboard: views -> CTA clicks -> validated outbound clicks -> provider-confirmed transactions -> net commission/revenue, per campaign and video; show missing-data/lag status. EPN/Amazon reports may be unavailable, in which case label revenue UNVERIFIED rather than zero.
7. Tests: unmatched title yields no monetized CTA; mismatched series/figure rejected; invalid campaign rejected; partial status not published; HEAD redirect validation does not log clicks; no Blue approval bypass; no duplicate channel publication; no secret or PII output.
8. Only after existing P1 approval-state regression and duplicate-publishing risks are repaired, fresh CI and independent review pass, and owner approval is granted, deploy through normal protected PR workflow.

## Acceptance evidence
- PR diff, test logs and independent review verdict
- deployed SHA, HTTP public page, item-to-offer mapping, and HEAD redirect target (sanitized)
- authorized Blue approval and external channel receipts
- click event correlated by campaign without secrets
- provider-confirmed commission or explicit `not yet verified` status

This plan does not establish actual conversion or earnings.
