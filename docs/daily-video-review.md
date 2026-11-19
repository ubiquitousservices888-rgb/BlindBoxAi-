# Daily video review pipeline — gated rollout

This schedule prepares one verified, source-linked candidate per UTC day at 14:23, not an unattended public post.

- The daily job creates a product-specific script, a first-party CTA and required affiliate disclosures, and an Actions artifact.
- Read-only artifact history prevents reuse of the same product for 30 days. A paid render attempt is reserved before dispatch. A missing or incomplete history fails closed.
- The verified-product input currently holds **one product**. That is not enough for a fresh video every day. A sustained release requires expanding the source-verified product pool.
- Paid video generation is OFF by default. After approving provider charges, the owner must set repository variables `DAILY_VIDEO_RENDER_ENABLED=true` and `DAILY_VIDEO_MAX_RENDERS_PER_MONTH` to an integer between 1 and 31. The cap is a cap on **new render requests**, not a verified dollar cap.
- When explicitly enabled, the schedule dispatches `autonomous-video.yml` with an exact validated product ID, `publish_after_approval=false`, and `youtube_audience=unreviewed`.
- The existing Creatomate/Gemini render path still applies source, provider, MP4, and canonical Supabase staging checks. Each public YouTube/TikTok post still requires watching that exact MP4 and separate Blue approval. The `social-production` publishing gate remains unchanged.
- A script, dispatch, hosted MP4, approved video, public social post, qualified visit, and provider-confirmed commission are distinct evidence levels; never conflate them.

Release verification:
1. Run `node --test scripts/daily-video-candidate.test.mjs`, `node --test scripts/workflow-publish-safety.test.mjs`, `npm run video:test`, and `npm run docs:state-check`.
2. Require passing exact-tip CI, independent review, merge, and verification on production before describing the daily schedule as live.
3. Inspect one candidate artifact with paid generation disabled.
4. Obtain an explicit monetary budget authorization and verify provider pricing before enabling paid rendering. Keep the monthly request cap to bound attempts.
5. Test one render and verify canonical storage, MP4 quality, correct source, caption, disclosure, and READY_FOR_REVIEW without creating a public Buffer post.
6. After individual owner approval, verify public YouTube/TikTok receipts, actual landing traffic, and partner-confirmed conversions.

To halt new charges, disable `DAILY_VIDEO_RENDER_ENABLED`. Never erase artifact receipts to re-trigger duplicates.
