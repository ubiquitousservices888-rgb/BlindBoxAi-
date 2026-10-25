# Public video URL receipts

**Documentation status: ACTIVE SPECIALIST** — URL configuration, accepted-post recovery and historical reconciliation. `AGENTS.md` and `docs/CURRENT_STATE.md` retain governance authority.

## Permanent configuration

The production website is served at both verified custom domains, `blindboxai.com` and `www.blindboxai.com`. Platform video URLs come from Buffer's nullable `Post.externalLink`; neither a website environment variable nor a Buffer queue ID can supply one.

The publisher reads the exact accepted Buffer post using the documented `post(input: { id })` query. Unlike a recent-post search, this has no 45-day cutoff. It checks the expected post and destination channel IDs, single exact approved source MP4, exact approved caption, disclosure and allowed HTTPS URL. A `sent` receipt without a permalink remains pending. Reads retry for at most five minutes with per-request timeouts; the public-page probe also caps its response body. Buffer's YouTube `privacy` is explicitly `public`; the owner's Made-for-Kids decision remains mandatory.

Only known permalink forms normalize locally: YouTube watch, Shorts, live and youtu.be URLs become an HTTPS www.youtube.com watch URL for the same ID; TikTok uses its www host and exact video path. Unknown hosts, credential-bearing URLs, repeated YouTube `v` IDs and redirects fail closed. The unauthenticated probe still requires exact public player metadata. No page script or discovered media URL is executed or fetched.

## Recovery without duplicate creation

After Buffer accepts an ID, the canonical queue runner logs the non-secret ID and writes `record_submission` before probing the public page. This action requires the same GitHub OIDC owner-production gate and exact publishing lease as the other queue writes. A compare-and-set preserves the other channel's receipt and refuses conflicting IDs. It never changes published channels, URLs or publication status.

If a URL arrives late, the queue retains the submitted ID. The next authorized execution verifies that exact post instead of creating a replacement. A provider timeout or absent public player metadata remains pending, never a publication receipt. A crash before Buffer returns an ID is still an ambiguous external operation: reconcile provider records before retrying. This change does not implement the separate durable scheduling proposal in PR #280.

Deploy the updated `review-video-queue` function before exercising a live publisher. The existing main-only publishing-gate deployment workflow handles this change. Until deployment is verified, do not run a live publication.

## Historical URL reconciliation

The existing Buffer organization diagnostic now runs `scripts/reconcile-public-video-urls.mjs` against `data/public-video-receipt-inventory.json`. It runs manually or once when its own workflow changes on reviewed main; there is no new schedule. The checked-in inventory is a dated allowlist of exact stored provider IDs and approved source MP4 URLs. The diagnostic derives a canonical platform URL only after verifying its Buffer receipt. The inventory is not a credential or publication instruction.

The script only reads Buffer GraphQL queries and public platform HTML. It requires the currently approved exact destination, the known post ID, matching source MP4, disclosure, per-video campaign/source and public metadata before returning a verified receipt. It outputs fixed reason codes and approved receipt fields, never provider captions, token values or raw errors. Missing IDs and unmatched evidence remain unverified, with exit code 2. No title search, upload, provider mutation, affiliate outbound click, database write or automatic repost exists in this diagnostic.

An actual backfill requires separately retained before/after snapshots and an idempotent owner-authorized write for only the exact evidence-proven row/channel. Do not fill a missing URL by guessing or by sending the video again. A public metadata receipt cannot prove matching transcoded bytes, completed playback or affiliate commissions.

## Verification

`npm run video:test` includes disposable HTTP reproduction of sent-before-URL, wrong-channel receipts, canonical requests, acceptance checkpoints, bounded waits and lease conflicts. Historical diagnostic tests cover exact identities, duplicate IDs, source media, campaign/disclosure failures and inaccessible public pages. Run the existing full QA/release gates before merging.

Primary API contract: https://developers.buffer.com/reference.html (`Post`, `PostInput`, `YoutubePostMetadataInput`).
