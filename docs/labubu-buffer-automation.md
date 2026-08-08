# Labubu Buffer Automation

Automated social-content pipeline for Labubu series inside BlindBoxAI.
Generates platform-specific posts and a Buffer-ready CSV from validated market data.

---

## Architecture

```
data/
  series/labubu-*.json          — series + figure data (authentication, odds, etc.)
  labubu-market-pricing.json    — market pricing config (seed/stale by default)
  labubu-video-manifest.json    — video ↔ caption pairing config

scripts/
  labubu-post-generator.mjs     — generates posts + Buffer CSV
  labubu-validate.mjs           — validates data + generated output
  labubu-test.mjs               — unit/integration tests

output/labubu/                  — generated output (gitignored)
  buffer-schedule.csv           — Buffer bulk-upload file
  video-manifest-scheduled.json — video manifest with scheduled times

.github/workflows/
  labubu-buffer.yml             — GitHub Actions automation
```

---

## Required secrets / environment variables

No secrets are required for local data validation or post generation.

For the affiliate-click analytics feature (existing BlindBoxAI feature, not Labubu-specific):

| Secret name | Where to set | Used by |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | GitHub Actions → Settings → Secrets | `affiliate-click-report.mjs` only |

Buffer publishing is **not** automated. The output CSV must be uploaded manually to Buffer's Bulk Scheduler.

---

## How to run manually

### 1. Generate posts + Buffer CSV

```bash
node scripts/labubu-post-generator.mjs
```

Output written to `output/labubu/`.

### 2. Validate data and output

```bash
node scripts/labubu-validate.mjs
```

Exits with code 1 and a list of errors if any check fails.

### 3. Run tests

```bash
node --test scripts/labubu-test.mjs
```

---

## How GitHub Actions runs

The workflow (`.github/workflows/labubu-buffer.yml`) can be triggered two ways:

**Manual:**
1. Go to Actions → **Labubu Buffer Automation** → Run workflow.
2. Optionally check **dry_run** to skip artifact upload.

**Scheduled:** Runs every Monday at 08:00 UTC automatically.

The workflow:
1. Validates all Labubu series data files.
2. Runs `labubu-post-generator.mjs` to generate posts + CSV.
3. Runs `labubu-validate.mjs` to validate generated output.
4. Runs `labubu-test.mjs` unit tests.
5. Uploads `output/labubu/` as a GitHub Actions artifact (30-day retention).

---

## Where generated Buffer CSV files appear

After a successful workflow run:

1. Go to **Actions** → select the run.
2. Scroll to **Artifacts** → download `labubu-buffer-schedule-<run_id>`.
3. Extract the zip — the file you need is `buffer-schedule.csv`.
4. Upload to [Buffer Bulk Scheduler](https://buffer.com/guides/bulk-schedule).

> ⚠️ Buffer publishing is **not** automated. Manual upload is required.

---

## How to add or replace a video

1. Copy your MP4 to `media/` (not committed — add path to `.gitignore` if large).
2. Open `data/labubu-video-manifest.json`.
3. Add or update an entry:

```json
{
  "id": "my-video-id",
  "videoPath": "media/my-video.mp4",
  "seriesSlug": "labubu-the-monsters-hair-salon",
  "title": "My Video Title",
  "caption": "Caption text here. CTA at BlindBoxAI — link in bio.",
  "hashtags": ["#Labubu", "#BlindBoxAI"],
  "cta": "Full guide at BlindBoxAI — link in bio.",
  "targetChannels": ["tiktok", "instagram", "youtube_shorts"],
  "scheduledTime": null
}
```

4. Run the post generator — `scheduledTime` will be populated automatically.

---

## How to update Labubu pricing data safely

Pricing data is marked `STALE_SEED_DATA` by default. No prices are published in social posts unless a variant's `status` is `"verified"`.

To add real pricing for a variant:

1. Open `data/labubu-market-pricing.json`.
2. Find the correct series and variant entry.
3. Update:

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

4. Run validation: `node scripts/labubu-validate.mjs`
5. Verify the post generator picks up the price: `node scripts/labubu-post-generator.mjs`

**Rules:**
- `sample_size` should be ≥ 2 before marking `"verified"`.
- `source` must describe where the data came from.
- `checked_at` must be the date you pulled the data.
- Posts will use language like "recent listings checked: $X–$Y" — never "market average".

---

## Integration point remaining (one-time setup)

Buffer's API is not integrated. To fully automate publishing:

1. Obtain a Buffer API token.
2. Add it as a GitHub Actions secret: `BUFFER_API_TOKEN`.
3. Add a publish step to `.github/workflows/labubu-buffer.yml` that POSTs rows from `buffer-schedule.csv` to the Buffer API.

Until that step is added, download the CSV artifact and upload it manually.
