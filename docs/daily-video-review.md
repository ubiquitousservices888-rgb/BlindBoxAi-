# Daily video review pipeline — gated rollout

The `daily-video-candidate-stage.yml` schedule runs at 14:23 UTC after an approved merge into `main`. It prepares at most one source-verified **JSON candidate**, not an MP4 or public post. It never renders, dispatches, spends money or posts to any social channel.

- The daily job creates a product-specific script, a first-party CTA and required affiliate disclosures, and an Actions artifact.
- Only draft artifacts tied to **successful runs of this exact workflow on `main`** are read as candidate history. The stage checks retention of available receipts against the 30-day cooldown, and requires an artifact for each successful main-branch run in that window. API errors, missing successful-run artifacts, short observed retention, malformed receipts and truncated result pages fail closed. An empty run history is valid for the first run; it does not prove older social posts are absent. These are staging receipts, not public playback proof.
- `data/video-autonomy-exclusions.json` blocks the currently retired Hair Salon product and records all five owner-targeted removal run IDs. It does not delete media or platform posts.
- The verified-product input currently holds **one product**, and that Hair Salon product is excluded by owner removal intent. Thus the current workflow correctly reports **NO_UNUSED_VERIFIED_PRODUCT**; it will not produce a new candidate until a fresh, allowed product is independently verified and added. This does not enable a renderer.
- Paid video generation is **hard-disabled** in current production video workflows. This draft stage fixes `DAILY_VIDEO_MAX_RENDERS_PER_MONTH` to `0`. Setting a variable alone must never bypass the paused renderer; a verified maximum-dollar gate and separate explicit approval are prerequisites for any future paid media.
- The draft stage does **not** dispatch `autonomous-video.yml` or the publisher. Automated candidate selection and automated public release are separate projects with separate owner-controlled gates.
- The existing Creatomate provider-render jobs are paused. Gemini fallback/rendering is disabled, not an active alternative. Any separately approved future renderer must pass source, provider-cost, MP4 and canonical Supabase staging checks. Each public YouTube/TikTok post still requires viewing the exact MP4 and a separate Blue approval. The `social-production` publishing gate remains unchanged.
- A script, dispatch, hosted MP4, approved video, public social post, qualified visit, and provider-confirmed commission are distinct evidence levels; never conflate them.

Release verification:
1. Run `node --test scripts/daily-video-candidate.test.mjs`, `node --test scripts/workflow-publish-safety.test.mjs`, `npm run video:test`, and `npm run docs:state-check`.
2. Require passing exact-tip CI, independent review, merge, and verification on production before describing the daily schedule as live.
3. Inspect one candidate artifact with paid generation disabled.
4. Obtain an explicit monetary budget authorization and verify provider pricing before enabling paid rendering. Keep the monthly request cap to bound attempts.
5. Test one render and verify canonical storage, MP4 quality, correct source, caption, disclosure, and READY_FOR_REVIEW without creating a public Buffer post.
6. After individual owner approval, verify public YouTube/TikTok receipts, actual landing traffic, and partner-confirmed conversions.

The current proposed schedule has no charge path. Future paid workflows must include a separately approved monetary limit and fail-closed provider enforcement. Never erase candidate receipts to re-trigger duplicates.

## Supersession of historical PR #279

- PR #278's insert-only staging fix is already merged; the earlier staging prerequisite in #279 is historical.
- This PR replaces the **candidate preparation only** from #279. It does not revive its manual provider-render opt-in, exact-product dispatch, paid provider calls, or automatic Buffer publishing.
- Review-only candidate receipts are saved on every successful scheduled run, including when rendering is disabled; a second reservation for the same UTC date fails closed. A product selected in a trusted successful-run artifact within 30 days is excluded. Malformed or incomplete history fails closed; an empty history on the first run is allowed. Draft receipts do not count as paid-render attempts.
- The scheduled workflow's monthly render-request cap is **fixed at 0** and is **not** a financial budget or a permission to spend. The optional `canRender` value from the pure planner cannot activate any external renderer.
- Source verification is applied separately to each eligible item: a retired or stale source cannot block another eligible, verified product. Excluded products remain excluded until an owner-authorized inventory update.
- The PR CI path filter covers the planner, its tests, source validation modules, verified product input, protected workflow tests, and package dependencies. PR #279's historical failed commits do not constitute current release evidence; require green checks on this PR's exact head.
