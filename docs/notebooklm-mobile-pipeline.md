# NotebookLM Mobile Video Pipeline

This path removes Creatomate from the critical path for videos you already generate in NotebookLM/Gemini.

## Flow

1. Generate a fact-checked video in NotebookLM.
2. Download the MP4 to Android.
3. In Termux, run `npm run video:notebooklm -- --file /path/to/video.mp4`.
4. The script validates the selected product against `data/verified-video-products.json`.
5. The MP4 is uploaded to a **public Vercel Blob store** and a `READY_FOR_REVIEW` record is written.
6. Review the video and caption/CTA.
7. Run `npm run video:approve`.
8. Run `npm run video:publish` to send the hosted video to configured Buffer channels.

## One-time setup

The public video store must be separate from any private Blob store used for analytics. From a linked Vercel project:

```bash
npx vercel@latest blob create-store blindboxai-videos --access public
npx vercel@latest env pull .env.local
```

If the generated environment variable is not named `VIDEO_BLOB_READ_WRITE_TOKEN`, either rename/copy it in `.env.local` or export it before ingest. The ingest script also accepts `BLOB_READ_WRITE_TOKEN`, but that token must belong to a **public** Blob store.

Buffer publishing additionally requires `BUFFER_API_TOKEN` and `BUFFER_ORGANIZATION_ID` in `.env.local`.

## Android / Termux example

```bash
cd "$HOME/BlindBoxAi-" 2>/dev/null || cd "$HOME/BlindBoxAI" 2>/dev/null || exit 1
git fetch origin
git switch feat/notebooklm-mobile-video-ingest
git pull --ff-only
npx vercel@latest env pull .env.local
find /storage/emulated/0/Download -maxdepth 1 -type f -iname '*.mp4' -printf '%T@ %p\n' | sort -nr | head
npm run video:notebooklm -- --file "/storage/emulated/0/Download/YOUR_VIDEO.mp4"
```

Then review the hosted URL printed by the script. If correct:

```bash
npm run video:approve
npm run video:publish
```

## Affiliate attribution

The video CTA sends viewers to the verified BlindBoxAI product/series page. That page contains eBay Partner Network links generated with the configured EPN campaign ID and Custom IDs. Do not place secrets or raw EPN credentials in the MP4 or repository.

For video/social posts, keep the affiliate disclosure in the caption and ensure the video itself contains whatever visual/audible disclosure is required by the current platform and eBay Partner Network rules before approval.

## Analytics

- BlindBoxAI affiliate clicks are recorded by the existing outbound analytics path.
- EPN reporting provides commission/click attribution through the campaign ID and Custom IDs.
- Run `npm run affiliate:report` for the existing BlindBoxAI click report when `.env.local` contains the private analytics Blob token expected by that script.

## Safety gates preserved

- verified-data-only product selection
- affiliate disclosure in generated caption
- `READY_FOR_REVIEW` state
- manual approval before Buffer publishing
- duplicate publishing prevention
- partial-channel retry handling
