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

The existing Buffer organization diagnostic now runs `scripts/reconcile-public-video-urls.mjs` against `data/public-video-receipt-inventory.json`. It runs manually or when the diagnostic, runtime libraries, inventory or its workflow changes on reviewed main; there is no new schedule. The checked-in inventory is a dated allowlist of exact stored provider IDs and approved source MP4 URLs. The diagnostic derives a canonical platform URL from the exact Buffer receipt. A `candidatePublicUrl` on an UNVERIFIED record is only a provider-reported location; it is not a verified media receipt. The inventory is not a credential or publication instruction.

The script reads Buffer GraphQL queries, public platform HTML and bounded review-storage MP4 bodies when an alternate source needs a byte comparison. It requires the currently approved exact destination, the known post ID, matching source MP4, disclosure, per-video campaign/source and public metadata before returning a verified receipt. It outputs fixed reason codes and approved receipt fields, never provider captions, token values or raw errors. Missing IDs and unmatched evidence remain unverified, with exit code 2. No title search, upload, provider mutation, affiliate outbound click, database write or automatic repost exists in this diagnostic.

Failed public checks retain fixed reasons for HTTP status, redirect, body limits, missing/unplayable/private metadata or a media-ID mismatch. Source failures retain counts, match classifications and safe hostnames, plus SHA-256 digests and byte lengths when a complete mirror comparison is available. They never expose source paths, signed query strings or raw errors. These diagnostics do not relax any publication gate.

The October 26 inventory also joins `published_collectible_videos` by exact `research_run_id` and identical approved `video_url`. That ledger recovered six provider IDs omitted from three review-queue rows. Its provenance is retained in the inventory; this does not itself update production or establish public availability. Each ID is still checked against Buffer's exact destination and campaign/disclosure.

Historical source reconciliation accepts either the exact approved URL or complete equal SHA-256 and byte length against an approved review-storage reference. The approved reference URL always follows the existing review-storage policy. The provider-copy URL also follows that policy unless it uses the one exact Buffer backfill host described below. That policy permits the exact `lazzdoadoqzrzlarerfx.supabase.co` host under `/storage/v1/object/public/blindboxai-review-videos/media/review/`, and all subdomains of `.public.blob.vercel-storage.com` under `/media/review/`; both require an MP4 path. A Vercel hostname alone is not source-identity proof: its complete bytes must match the approved source. Mirror reads omit credentials, reject redirects and nonstandard ports, accept `video/mp4`, `application/mp4` or `application/octet-stream`, and enforce a 32 MiB limit and a 20-second request/body deadline. The report retains digests and lengths without source URLs. Unequal bytes, including an unproven transcode, remain unverified. The live publisher's exact-source contract is unchanged.

An actual backfill requires separately retained before/after snapshots and an idempotent owner-authorized write for only the exact evidence-proven row/channel. Do not fill a missing URL by guessing or by sending the video again. A public metadata receipt cannot prove matching transcoded bytes, completed playback or affiliate commissions.

Diagnostic run `40327425667` confirmed all twenty provider IDs and campaign/disclosure checks. All ten TikTok receipts reported their source on the exact `buffer-updates-media-backfill-bucket.s3.amazonaws.com` host. The historical verifier can read only a non-root object path on that exact provider-copy host after exact receipt/destination checks; unlike review-storage URLs, that one provider-copy path need not end in `.mp4`. It must still return an allowed MP4 MIME type, and only complete SHA-256 and byte-length equality with the approved review-storage file establishes source identity. It cannot use that bucket as the approved reference, trust another S3 bucket, follow redirects, or accept a different hash. Signed source paths and query strings stay out of reports.

## Verification

`npm run video:test` includes disposable HTTP reproduction of sent-before-URL, wrong-channel receipts, canonical requests, acceptance checkpoints, bounded waits and lease conflicts. Historical diagnostic tests cover exact identities, duplicate IDs, source media, campaign/disclosure failures and inaccessible public pages. Run the existing full QA/release gates before merging.

Primary API contract: https://developers.buffer.com/reference.html (`Post`, `PostInput`, `YoutubePostMetadataInput`).
