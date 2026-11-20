# Daily video review pipeline — gated rollout

The proposed `daily-video-candidate-stage.yml` runs each day at 14:23 UTC on `main`, but it is **only a draft PR until independently reviewed and merged**. It produces at most one source-verified candidate JSON artifact and never renders, dispatches, spends money, or posts to any social channel.

- The daily job creates a product-specific script, a first-party CTA and required affiliate disclosures, and an Actions artifact.
- Read-only Actions artifact history blocks repeat candidate selection for 30 days. GitHub API errors, malformed history or a truncated artifact page fail closed. These receipts are staging evidence only, not public publication proof.
- `data/video-autonomy-exclusions.json` blocks the currently retired Hair Salon product and records all five owner-targeted removal run IDs. It does not delete media or platform posts.
- The verified-product input currently holds **one product**, and that Hair Salon product is excluded by owner removal intent. Thus the current workflow correctly reports **NO_UNUSED_VERIFIED_PRODUCT**; it will not produce a new video until a fresh, allowed product is independently verified and added.
- Paid video generation is **hard-disabled** in current production video workflows. This draft stage fixes `DAILY_VIDEO_MAX_RENDERS_PER_MONTH` to `0`. Setting a variable alone must never bypass the paused renderer; a verified maximum-dollar gate and separate explicit approval are prerequisites for any future paid media.
- The draft stage does **not** dispatch `autonomous-video.yml` or the publisher. Automated candidate selection and automated public release are separate projects with separate owner-controlled gates.
- The existing Creatomate/Gemini render path still applies source, provider, MP4, and canonical Supabase staging checks. Each public YouTube/TikTok post still requires watching that exact MP4 and separate Blue approval. The `social-production` publishing gate remains unchanged.
- A script, dispatch, hosted MP4, approved video, public social post, qualified visit, and provider-confirmed commission are distinct evidence levels; never conflate them.

Release verification:
1. Run `node --test scripts/daily-video-candidate.test.mjs`, `node --test scripts/workflow-publish-safety.test.mjs`, `npm run video:test`, and `npm run docs:state-check`.
2. Require passing exact-tip CI, independent review, merge, and verification on production before describing the daily schedule as live.
3. Inspect one candidate artifact with paid generation disabled.
4. Obtain an explicit monetary budget authorization and verify provider pricing before enabling paid rendering. Keep the monthly request cap to bound attempts.
5. Test one render and verify canonical storage, MP4 quality, correct source, caption, disclosure, and READY_FOR_REVIEW without creating a public Buffer post.
6. After individual owner approval, verify public YouTube/TikTok receipts, actual landing traffic, and partner-confirmed conversions.

The current proposed schedule has no charge path. Future paid workflows must include a separately approved monetary limit and fail-closed provider enforcement. Never erase candidate receipts to re-trigger duplicates.
