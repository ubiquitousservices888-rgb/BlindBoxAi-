# Autonomous verified video pipeline

> **Documentation status: ACTIVE SPECIALIST — paid rendering paused.** This describes `.github/workflows/autonomous-video.yml`, not the canonical Supabase review-queue publisher. Read [CURRENT_STATE.md](./CURRENT_STATE.md) for the current topology.

## Owner pause — November 14, 2026

Gemini fallback is disabled until an approval plus max-dollar spending check is built and verified before the Gemini call. That spending control is **NOT IMPLEMENTED**. The current protection is an executable pause, not a completed budget gate.

- Both `autonomous-video.yml` and `gemini-video-stage.yml` set their render job condition to unconditional false. Neither can start a paid provider, even on a qualifying `main` data push or manual dispatch.
- Both workflows remove the Gemini fallback command, Gemini API credential, Blob upload credential and resolution configuration. Their legacy Gemini render opt-in is explicitly false.
- `npm run video:gemini-stage` exits with a disabled message before imports, product reads, provider calls, uploads or state writes. Legacy environment opt-ins cannot enable it.
- The autonomous validation job can still run offline safety tests and validate source data.
- Its downstream publisher still requires successful rendering, exact-media review, the owner's audience decision and the existing `social-production` gate. A skipped render job cannot satisfy that dependency.
- The canonical `publish-approved-reviews.yml` path for existing owner-reviewed media is unchanged.

## Re-enabling requirement

Keep the render jobs and Gemini fallback off until a separate reviewed change enforces the owner's approval of the exact named action and maximum dollar amount **before** any paid provider invocation. Verify rejection of missing, invalid or exceeded budgets with disposable tests before any separately approved live attempt.

This change does not implement that spending mechanism, authorize a paid or test render, produce a live video, or establish revenue. Existing parser unit tests use local synthetic responses only.

## Offline checks

```bash
npm run video:test
npm run docs:state-check
node scripts/video-pipeline.mjs validate
```

Never put credential values in documentation, logs, commits or handoffs. The old descriptions of automatic Creatomate-to-Gemini fallback are superseded by this owner pause.
