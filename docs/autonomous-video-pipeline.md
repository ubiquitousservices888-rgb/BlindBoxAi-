# Autonomous verified video pipeline

> **Documentation status: ACTIVE SPECIALIST.** This describes `.github/workflows/autonomous-video.yml`, not the canonical Supabase review-queue publisher. For the current topology and source-of-truth rules, read [CURRENT_STATE.md](./CURRENT_STATE.md).

This path selects verified product input, renders one production-quality video, stops at owner review, and can publish only after the `social-production` approval gate.

## Current workflow behavior

`.github/workflows/autonomous-video.yml` currently:

1. runs validation when `data/verified-video-products.json` changes on `main`, or by manual dispatch;
2. runs the video safety tests and validates source data;
3. tries the configured Creatomate renderer first;
4. may use the guarded Gemini renderer when its required configuration is present;
5. fails closed if no production-quality renderer succeeds;
6. rejects placeholder/mock/deterministic low-quality render providers;
7. requires a hosted HTTPS MP4 and `READY_FOR_REVIEW` state;
8. stores the exact review state as an artifact;
9. waits at the `social-production` GitHub Environment;
10. restores the exact reviewed state and verifies that the video URL did not change;
11. records approval and then calls the Buffer publishing path.

The default video channel set is `youtube,tiktok` unless the approved environment variable `VIDEO_CHANNELS` explicitly changes this specialist workflow. Do not use that variable to infer the canonical review-queue publisher; that publisher is separately pinned in `publish-approved-reviews.yml`.

## Safety model

- Source data must pass the repository's verification checks.
- No eligible/valid product means the path fails closed.
- Review media must be a public HTTPS MP4.
- Low-quality placeholder/mock providers cannot reach review or publication.
- The exact reviewed URL must survive unchanged into the approval job.
- Buffer configuration is checked before publication.
- Owner approval remains outside the render job.

## Configuration names

Secret or variable **names** used by this specialist workflow include:

- `CREATOMATE_API_KEY`
- `CREATOMATE_TEMPLATE_ID`
- `GEMINI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `BUFFER_API_TOKEN`
- `BUFFER_ORGANIZATION_ID`
- `VIDEO_CHANNELS`
- `GEMINI_VIDEO_RESOLUTION`

Never place secret values in documentation, logs, commits, or Context Transfers.

## Verified product input

Products are sourced from `data/verified-video-products.json`. Claims must remain narrow and source-linked. The code and validators on `main` are authoritative for the current schema.

## Local commands

```bash
npm run video:test
node scripts/video-pipeline.mjs validate
npm run video:daily
npm run video:approve
npm run video:reject -- --reason "Audio needs correction"
npm run video:publish
```

The local state file is `output/video-pipeline/state.json`. It is a review/publish receipt and must not be committed.
