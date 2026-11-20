# Supported-topic video-to-landing reconciliation — owner review only

**Scope authorized November 20, 2026:** Pokémon TCG and POP MART only. One active code task: validate exact-media mappings and campaign-to-EPN attribution on the **existing** landing/outbound system. This document and its test do not publish, retry, upload, merge, schedule, spend, render, set environment variables or modify any currently approved video title or landing choice. PR #333 remains held.

## Existing production contract (read-only source audit)

- The runtime map is `data/review-video-landings.json`, with `landings[research_run_id] = {video_url, path, vertical}`. A valid ID matches `rv-[a-f0-9]{16}`; the stored URL must match **exactly**.
- `lib/review-landing.mjs` permits a named Pokémon guide (`/guides/mew-ex-152-vs-158`) and specific existing POP MART `/series/<slug>` pages. Unsupported topics, missing IDs, media mismatch and mismatched specific verticals fail closed. A generic `other_collectible` row relies on an owner-chosen vertical, not proof of its video's subject.
- `lib/review-caption.mjs` and `lib/social-attribution.mjs` produce `?campaign=bb-<research_run_id>&source=youtube|tiktok`. Those are **expected current-code tags**, not verified historical Buffer captions.
- `app/series/[slug]/page.jsx` forwards `campaign`/`source` into `ebayOutboundPath` and `LiveEbayListings`. The existing `/api/out/ebay` resolver accepts `placement=series_table` for a real series and exact figure; it rejects invented `video_card` placement. No new outbound route is authorized.
- `app/guides/mew-ex-152-vs-158/page.jsx` forwards tags to `/api/out/price-item`. That guide covers **Mew ex #152 vs #158**, not all Pokémon cards.
- Successful first-party URL construction and offline EPN URL validation are **not** verified provider clicks, conversions, commissions or cash. Do not infer those from URL tests.

## Five incomplete publication receipts (NO RESEND)

All five rows were `publishing` with a stored YouTube URL and Buffer post ID, and no TikTok URL or Buffer post ID in the November 20 read-only query. Missing TikTok receipts **do not establish no post exists on TikTok**. The owner previously targeted these five for removal, so do not dispatch/retry them as a side effect of mapping work.

| Run ID | Stored title | Existing mapping | Topic-fit assessment |
|---|---|---|---|
| `rv-9c5d343830fb30a8` | Pokémon Card Rarity: Don’t Mistake Common for Rare | Explicit: `/guides/mew-ex-152-vs-158` | Pokémon vertical matches, **exact Mew-topic fit unverified** |
| `rv-6b6023cb4aaaca52` | How to fake check a labibu | Explicit: `/series/labubu-the-monsters-big-into-energy` | POP MART mapping but generic fake-check content; exact series relevance **unverified** |
| `rv-4815685fb0b10117` | How to verify your Mew ex card | Explicit: `/guides/mew-ex-152-vs-158` | Promising title-level match; exact card numbers in video **unverified** |
| `rv-3c9c9bb78c37ff6a` | THE MONSTERS Hair Salon Series — Vinyl Plush Pendant Blind Box | Special immutable Hair Salon mapping to `/series/labubu-the-monsters-hair-salon` | Exact title/media special case; **owner retirement pending**, no retry |
| `rv-3658d7e94a70b562` | Common or rare | Explicit: `/guides/mew-ex-152-vs-158` | Generic title; exact Mew relevance **unverified** |

Any historical `source`/`campaign` values actually posted to YouTube/Buffer/TikTok require **provider receipt/caption reads**. Do not invent historical captions from today's source code.

## All 17 owner-uploaded MP4 files — preliminary content classification

All 17 local files were rehashed against the stored SHA-256 inventory on November 20. This verifies local copies, **not** their identity against queue/Supabase public objects or any actual public publication. Classification uses filenames and spot-checked video frames; it is **not** an item-identity approval.

| File | Topic category | Existing exact landing | Gate / reason |
|---|---|---|---|
| Before You Buy a Base Set Charizard.mp4 | Pokémon | **None** | Mew ex guide does not cover Base Set Charizard |
| Don’t Buy Pokémon 30th Before Checking This.mp4 | Pokémon | **None confirmed** | General 30th subject is not automatically Mew ex #152/#158 |
| How Completed Sales Determine Pokémon 30th Prices.mp4 | Pokémon | **None confirmed** | Pricing discussion; needs exact card identification |
| Pokémon 30th_ Asking Price vs Sold Price.mp4 | Pokémon | **None** | Sampled frame refers to Sylveon ex #153/128; existing Mew ex guide differs |
| The 16 Million Dollar Pikachu.mp4 | Pokémon | **None** | Specific Pikachu subject requires its own exact-topic evidence/page |
| Unpacking the Labubu Macaron Obsession.mp4 | POP MART | **Candidate only:** `/series/labubu-the-monsters-exciting-macaron` | Exact series suggested by title and sampled imagery; no queue binding/owner landing choice; pricing/sold data remains unverified seed |
| How Scarcity Drives SKULLPANDA Valuations.mp4 | POP MART | **None confirmed** | Series/variant needs exact identification |
| Why Twinkle Twinkle Is POP MART's Next Labubu.mp4 | POP MART | **None confirmed** | Brand/IP commentary does not establish one specific listed series |
| Why Twinkle Twinkle Is POP MART's Next Rotation.mp4 | POP MART | **None confirmed** | Brand/IP commentary; several existing Twinkle Twinkle series differ |
| How Exact-Card Research Isolates Value.mp4 | Generic/card research | **Out of scope** | Needs exact topic/evidence; no supported generic card-research guide |
| How to Evaluate an Unpriced Rookie Relic.mp4 | Sports cards | **Out of scope** | No supported matching landing |
| How to Evaluate an Unpriced Rookie Relic (1).mp4 | Sports cards | **Out of scope** | Distinct local MP4, may overlap topic; no supported landing |
| How to Protect Cards Before Grading.mp4 | Card protection | **Deferred** | Existing Amazon accessory page not an approved eBay card-protection route |
| Why Investors Are Chasing 2021 Triple Threads.mp4 | Sports cards | **Out of scope** | No supported matching landing |
| Why Rare Doesn't Always Mean Expensive.mp4 | Generic collectibles | **Out of scope** | No exact series/card named |
| Why This Tier One Abreu Auto Is A Steal.mp4 | Sports cards | **Out of scope** | No supported matching landing |
| Why Your Blind Box Collection Needs a Showcase.mp4 | Collector accessories | **Deferred** | Amazon eligibility and topic-matched approved EPN offers unverified |

**Macaron limitation:** `data/series/labubu-the-monsters-exciting-macaron.json` exists and the legacy series page renders a first-party `/api/out/ebay` active-listing path; however its figure `needsReview` flags are true, prices are null, and `marketPricing._status` is `STALE_SEED_DATA`. A syntactically working outbound path is NOT equivalent to current verified market evidence or a qualified conversion. **Do not add a runtime map entry yet.**

## Exact proposed mapping once independently ready (NOT active)

1. The owner selects the actual MP4 and exact product/series after full viewing; identify a unique **canonical** Supabase `video_url` and `rv-...` row. Match the remote asset SHA-256 to the approved local bytes; filenames alone are not identity.
2. Verify the video's factual claims and any price figures against current, independent sources; verify page-to-subject relevance, permitted EPN offers and affiliate disclosures. For Macaron, repair the stale market evidence before treating the offer as approved.
3. Only then add `landings[exact_run_id] = { "video_url": "<exact-reviewed-Supabase-mp4>", "path": "/series/labubu-the-monsters-exciting-macaron", "vertical": "pop_mart" }` to the existing mapping, in an **independently approved** future PR. No URL, run ID or SHA may be fabricated.
4. Tests must prove the exact same `campaign` and platform `source` survive social caption → landing page → `/api/out/ebay` `series_table` → EPN Custom ID/affiliate URL; a different/missing video URL or unrecognized run ID must be blocked.
5. Before any posting, reconcile Buffer Sent/manual posts/TikTok/YouTube for duplicate prevention; run existing dry-run publisher and per-video Blue owner approval, plus independent production and attribution validation. Nothing in this PR grants that public-release approval.

**Stop criterion:** No queue-backed, owner-reviewed, exact-topic mapping with current eligible EPN evidence = no new runtime mapping or public post. Preserve #333 held and the five partial rows without retries. EPN authoritative transaction reporting is required to claim conversions or earnings.
