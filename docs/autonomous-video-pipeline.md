# Autonomous verified video pipeline

The pipeline selects one eligible product per day, builds a script only from source-linked claims, renders with Creatomate, and stops in `READY_FOR_REVIEW`. Buffer is unreachable until a person approves the exact hosted MP4 and caption.

## Safety model

- Sources must be HTTPS, marked `verified`, and checked within 30 days.
- Every generated factual claim must cite a verified source ID.
- No eligible product means the daily job fails closed.
- Creatomate must return a public HTTPS `.mp4` URL.
- Every caption must contain the EPN disclosure.
- Only `READY_FOR_REVIEW` can become `APPROVED` or `REJECTED`.
- Only `APPROVED` or `PARTIALLY_PUBLISHED` can call Buffer.
- Published channels are skipped permanently; retries target failed channels only.
- The stable `<record-id>:<channel>` key is sent as Buffer's idempotency key.

## Required secrets

Add these under GitHub **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `CREATOMATE_API_KEY` | Creatomate project API key |
| `CREATOMATE_TEMPLATE_ID` | Approved vertical-video template ID |
| `BUFFER_API_TOKEN` | Buffer API token |
| `BUFFER_CHANNEL_PROFILES` | JSON map such as `{"tiktok":"profile-id","instagram":"profile-id"}` |

Create a protected GitHub environment named `video-publish-approval` and add yourself as a required reviewer.

After a daily run, open its `ready-for-review-<run-id>` artifact to inspect the caption, state, and hosted MP4 URL. To reject or publish, manually run the workflow with that original run ID in `state_run_id`. A publish run pauses at the protected environment until you approve it; a reject run requires a reason and saves a rejection receipt.

## Verified product input

Add products to `data/verified-video-products.json`. Keep claims narrow and attach each claim to a source:

```json
{
  "id": "product-slug",
  "name": "Exact product name",
  "productUrl": "https://blindboxai.com/series/product-slug",
  "sources": [{
    "id": "official-listing",
    "url": "https://official-brand.example/product",
    "checkedAt": "2026-08-09T12:00:00.000Z",
    "status": "verified"
  }],
  "claims": [{
    "text": "A fact stated by the official listing.",
    "sourceId": "official-listing"
  }]
}
```

## Commands

```bash
npm test
npm run validate
npm run video:daily
npm run video:approve
npm run video:reject -- --reason "Audio needs correction"
npm run video:publish
```

The state file is `output/video-pipeline/state.json`. Keep it as the review/publish receipt; do not commit it.
