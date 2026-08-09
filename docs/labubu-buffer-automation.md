# Labubu Buffer Automation

Automated social-content pipeline for Labubu series inside BlindBoxAI.
Generates platform-specific posts and per-channel Buffer CSV files from validated market data.

> **Important distinction:**
> - **A) CSV bulk upload** — text + single-image posts only. No videos.
> - **B) Video publishing** — requires the Buffer API (or Buffer Composer) with a stable public MP4 URL. Cannot be done via CSV.

---

## Architecture

```
data/
  series/labubu-*.json          — series + figure data (authentication, data quality)
  labubu-market-pricing.json    — market pricing config (seed/stale by default)
  labubu-video-manifest.json    — video ↔ caption pairing (Buffer API, not CSV)

scripts/
  labubu-post-generator.mjs     — generates per-channel Buffer CSVs
  labubu-validate.mjs           — validates data + generated output
  labubu-test.mjs               — unit/integration tests

output/labubu/                  — generated output (gitignored)
  buffer-tiktok.csv             — Buffer bulk-upload: TikTok posts
  buffer-instagram.csv          — Buffer bulk-upload: Instagram posts (image required)
  buffer-facebook.csv           — Buffer bulk-upload: Facebook posts
  buffer-x.csv                  — Buffer bulk-upload: X (Twitter) posts
  buffer-pinterest.csv          — Buffer bulk-upload: Pinterest posts (image + board required)

.github/workflows/
  labubu-buffer.yml             — GitHub Actions: runs on PR + schedule
```

---

## A) CSV Bulk Upload (text + images)

Buffer's CSV bulk upload supports **text posts and single-image posts only**.

### Buffer CSV format

Each channel gets its own CSV file. Headers are exact and case-sensitive:

| Column | Notes |
|--------|-------|
| `Text` | Post body including hashtags and EPN disclosure |
| `Image URL` | Public image URL (required for Instagram; optional for others) |
| `Tags` | Hashtag string |
| `Posting Time` | `YYYY-MM-DD HH:mm` format |
| `Board Name` | Pinterest only — required |

### What CSV bulk upload does NOT support

- ❌ Videos / Reels / Shorts — use the Buffer API (see section B below)
- ❌ YouTube — YouTube bulk upload by CSV is not supported by Buffer
- ❌ Multi-image carousels

### Channel-specific requirements

| Channel | Image URL | Board Name | Notes |
|---------|-----------|------------|-------|
| TikTok | Optional | — | Text posts OK |
| Instagram | **Required** | — | Text-only posts not supported in bulk CSV |
| Facebook | Optional | — | Text posts OK |
| X (Twitter) | Optional | — | 280 char limit enforced |
| Pinterest | **Required** | **Required** | Board Name column must be present |

---

## B) Video Publishing (Buffer API)

> Buffer CSV bulk upload does **not** support videos or Reels.

To publish BlindBoxAI MP4 videos to TikTok, Instagram Reels, or YouTube Shorts:

1. Host your video at a **stable public HTTPS URL** (e.g. Cloudflare R2, S3, CDN).
2. The MP4 must be **H.264 video** + **AAC audio** and remain publicly accessible through the time of publishing.
3. Add the entry to `data/labubu-video-manifest.json` with `videoUrl` set to your hosted URL.
4. Set `enabled: true` only when the entry is fully configured and ready to publish.
5. Use the **Buffer API** (or Buffer Composer manually) to schedule the video.
6. Store your `BUFFER_API_TOKEN` in **GitHub Secrets only** — never in code or CSV files.

> ⚠️ Automatic video publishing via the Buffer API is **not yet activated**. The manifest is ready; a publish step must be added after the API token is obtained and the video URL is confirmed publicly accessible.

### Video manifest fields

```json
{
  "id": "my-video-id",
  "enabled": false,
  "videoUrl": "https://cdn.example.com/my-video.mp4",
  "seriesSlug": "labubu-the-monsters-hair-salon",
  "title": "My Video Title",
  "caption": "Caption text here.\n\n#ad BlindBoxAI may earn a commission from qualifying purchases.",
  "hashtags": ["#Labubu", "#BlindBoxAI"],
  "cta": "Full guide at BlindBoxAI — link in bio.",
  "targetChannels": ["tiktok", "instagram"],
  "videoSpec": {
    "format": "MP4",
    "codec": "H.264",
    "audio": "AAC"
  },
  "scheduledTime": null
}
```

**Note:** `videoPath` (local file path) is not used — `videoUrl` must be a public HTTPS URL.
Media files (`media/*.mp4`) are gitignored and must never be committed to the repository.

---

## Required secrets / environment variables

No secrets are required for local data validation or post generation.

| Secret name | Where to set | Used by |
|---|---|---|
| `BUFFER_API_TOKEN` | GitHub Actions → Settings → Secrets | Video publishing via Buffer API only (not yet activated) |
| `BLOB_READ_WRITE_TOKEN` | GitHub Actions → Settings → Secrets | `affiliate-click-report.mjs` only |

---

## How to run manually

### 1. Generate per-channel Buffer CSVs

```bash
node scripts/labubu-post-generator.mjs --skip-url-check
```

Output written to `output/labubu/`. Omit `--skip-url-check` to validate series page URLs live.

### 2. Validate data and output

```bash
node scripts/labubu-validate.mjs --skip-url-check
```

Exits with code 1 and a list of errors if any check fails.

### 2b. Strict publish preflight

```bash
node scripts/labubu-validate.mjs --strict-publish
```

Strict mode enforces publish gates for `enabled: true` videos: real public `https` media URL, no placeholders, disclosure, valid target channels, required metadata, live URL checks, and required `BUFFER_API_TOKEN`.

### 3. Run tests

```bash
node --test scripts/labubu-test.mjs
```

---

## How GitHub Actions runs

The workflow (`.github/workflows/labubu-buffer.yml`) triggers on:

- **Pull requests** — runs tests + validation + build. No artifact upload.
- **Manual** — Go to Actions → **Labubu Buffer Automation** → Run workflow.
- **Scheduled** — Every Monday at 08:00 UTC.

The workflow:
1. Runs `labubu-test.mjs` unit tests.
2. Validates all Labubu series data files.
3. Runs `labubu-post-generator.mjs` to generate per-channel CSVs.
4. Runs `labubu-validate.mjs` to validate generated output.
5. Runs `npm run build` (repository build).
6. Uploads `output/labubu/` as a GitHub Actions artifact (30-day retention, skipped on PRs).

Permissions: `contents: read` only. No automatic publishing.

---

## Where generated Buffer CSV files appear

After a successful workflow run:

1. Go to **Actions** → select the run.
2. Scroll to **Artifacts** → download `labubu-buffer-schedule-<run_id>`.
3. Extract the zip — upload each channel CSV separately:
   - `buffer-tiktok.csv` → Buffer → TikTok profile → Bulk Scheduler
   - `buffer-instagram.csv` → Buffer → Instagram profile → Bulk Scheduler
   - `buffer-facebook.csv` → Buffer → Facebook profile → Bulk Scheduler
   - `buffer-x.csv` → Buffer → X profile → Bulk Scheduler
   - `buffer-pinterest.csv` → Buffer → Pinterest profile → Bulk Scheduler

See [Buffer Bulk Scheduler documentation](https://buffer.com/guides/bulk-schedule).

> ⚠️ Buffer publishing is **not** automated. Manual CSV upload required.
> ⚠️ Videos/Reels require the Buffer API, not the CSV bulk uploader.

---

## How to update Labubu pricing data safely

Pricing data is marked `STALE_SEED_DATA` by default. No prices are published unless a variant's `status` is `"verified"`.

To add real pricing:

1. Open `data/labubu-market-pricing.json`.
2. Update the variant with real sold-listing data:

```json
{
  "variant": "Blueberry Macaron",
  "rarity": "common",
  "price_low": 18,
  "price_median": 22,
  "price_high": 28,
  "sample_size": 5,
  "checked_at": "2026-08-08",
  "source": "eBay sold listings (US)",
  "status": "verified"
}
```

3. Run: `node scripts/labubu-validate.mjs`

**Rules:**
- `sample_size` must be ≥ 2.
- `source` must describe the primary source.
- `checked_at` is the date you pulled the data.
- Posts use language like "recent listings checked: $X–$Y" — never "market average".

---

## How to verify retail price data

Series files contain `retailUSD` with a `_dataQuality.retailUSD` block. The retail price is only emitted in posts when `status` is `"verified"`:

```json
"_dataQuality": {
  "retailUSD": {
    "source": "POPMART official product listing",
    "checked_at": "2026-08-08",
    "status": "verified"
  }
}
```

Until verified, the retail price line is omitted from generated posts.

---

## One-time setup remaining

| Item | Status |
|------|--------|
| `BUFFER_API_TOKEN` GitHub Secret | Not yet added — required for video API publishing |
| Hosted video URLs in `labubu-video-manifest.json` | Placeholder — replace `REPLACE_WITH_HOSTED_VIDEO_URL` with real CDN URLs |
| Series page URL live validation | Skipped in CI (`--skip-url-check`) — confirm URLs resolve before enabling |
