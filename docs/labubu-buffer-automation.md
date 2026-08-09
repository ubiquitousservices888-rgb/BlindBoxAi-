# Labubu → BlindBoxAI → Buffer automation

This automation produces **Buffer CSV uploads for text+image posts** and a separate **Buffer API video payload** file.

## Output channels

CSV output is generated for these Buffer bulk-upload channels only:

- TikTok
- Instagram
- Facebook
- X
- Pinterest (adds `Board Name` column)

### Required Buffer CSV headers (case-sensitive)

- TikTok / Instagram / Facebook / X: `Text, Image URL, Tags, Posting Time`
- Pinterest: `Text, Image URL, Tags, Posting Time, Board Name`

> CSV video upload is not used. Video publishing is handled separately through Buffer API payloads.

## Security and data integrity guardrails

- Required affiliate disclosure in every post:
  - `#ad BlindBoxAI may earn a commission from qualifying purchases.`
- No publishable price or pull-odds claims from stale/unverified data.
- Only publishable series records with:
  - `status = "verified"`
  - `source.name` + `source.url`
  - `checked_at` (fresh, <= 30 days old)
- Validation fails on:
  - stale verified timestamps
  - dead URLs (except CI mode)
  - placeholder content
  - missing disclosure
  - invalid Buffer CSV headers
  - missing media URLs
  - past posting times
  - potential token/secret leakage

## Files

- `data/labubu/series/*.json` — verified series metadata + channel copy points + media
- `data/labubu/market-pricing.json` — stale seed market dataset (not publishable)
- `data/labubu/video-manifest.json` — video manifest that resolves MP4 URLs using `BLINDBOXAI_VIDEO_BASE_URL`
- `data/labubu/design-tokens.json` — reusable design tokens + social template metadata
- `scripts/labubu-post-generator.mjs` — generates per-channel Buffer CSV + API video payload JSON
- `scripts/labubu-validate.mjs` — policy and integrity checks
- `scripts/labubu-test.mjs` — generator/validator tests
- `.github/workflows/labubu-buffer.yml` — PR CI + scheduled automation checks

## Commands

```bash
npm ci
npm run labubu:generate
npm run labubu:test
npm run labubu:validate
npm run build
```

CI uses:

```bash
npm run labubu:validate -- --ci
```

`--ci` disables live URL checks to avoid network flake while preserving all schema/security checks.

## Environment variables

### Required for video API readiness

- `BLINDBOXAI_VIDEO_BASE_URL`
  - Example: `https://cdn.blindboxai.app/videos/labubu/`
  - Used to resolve stable public MP4 URLs in `labubu-buffer-video-api-payloads.json`

### Required for real Buffer video publishing (outside CSV path)

- `BUFFER_API_TOKEN` (GitHub Actions secret only)

Do **not** place `BUFFER_API_TOKEN` in source code, generated files, or logs.

## One-time production setup checklist

1. Add GitHub Actions secret `BUFFER_API_TOKEN`.
2. Set repository variable or environment secret for `BLINDBOXAI_VIDEO_BASE_URL`.
3. Upload real MP4 files to CDN matching `data/labubu/video-manifest.json` paths.
4. Verify each BlindBoxAI series URL resolves publicly.
5. Enable branch protection on `main` with required status check: `labubu-buffer-automation / quality-gate`.
6. Require CODEOWNERS review for release-critical files.
7. Keep external auto-publishing disabled until token scope and API publish path are confirmed in a dry run.

## Design system quality standard

Customer-facing social output uses reusable design tokens in `data/labubu/design-tokens.json`:

- consistent typography (display/body/mono)
- consistent spacing scale and corner radii
- cohesive BlindBoxAI color palette
- premium social template metadata for card/thumbnail production

This avoids one-off styling and keeps social output launch-ready and brand-consistent.
