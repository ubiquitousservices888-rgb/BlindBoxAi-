# BlindBoxAI Current State

**Purpose:** prevent state/documentation divergence by giving humans and agents one canonical orientation point.

**Last reconciled:** 2026-09-26  
**Functional baseline inspected:** `main` at `7e0eaa0cc887aaadf3da25f56c44b6d668b9db29`

This file is an orientation map, not evidence. If this document conflicts with code, workflow definitions, raw command output, or observable production behavior, the latter wins and this file must be updated in the same change that resolves the conflict.

## Governance authority

[`AGENTS.md`](../AGENTS.md) is the single canonical source for the evidence hierarchy, state vocabulary, and protected-action rules. This file only maps current repository topology.

Do not use an old branch as evidence of current behavior.

## Canonical owner-reviewed video path

The current Supabase review-queue publisher is:

`.github/workflows/publish-approved-reviews.yml`

Current invariants:

- trigger: `workflow_dispatch` only;
- default mode: `dry_run: true`;
- production video channels are pinned exactly to `youtube,tiktok`;
- X/Twitter is parked for this canonical review-queue publisher; merged PR #227 removed it from the completion target;
- a run can target one exact channel with `publish_channel`;
- a run can target one exact approved row with `research_run_id`;
- the workflow calls `scripts/publish-approved-review-queue.mjs`;
- Buffer credentials are referenced by name only and must never be printed.

This is the canonical publisher when discussing an already-approved review-queue item.

## Other video paths are separate, not replacements

### Manual reviewed upload

`.github/workflows/manual-reviewed-video.yml`

This validates one exact uploaded MP4, waits at the `social-production` environment, then publishes the exact owner-reviewed upload. Its `VIDEO_CHANNELS` value is configurable through the repository variable with an exact fallback of `youtube,tiktok`; that configurability is local to this workflow and does not redefine the canonical review-queue publisher.

### Verified-product render pipeline

`.github/workflows/autonomous-video.yml`

This is a separate render → review → owner-approval → Buffer path for `data/verified-video-products.json`. Its `VIDEO_CHANNELS` value also uses the repository variable with a `youtube,tiktok` fallback. It does not redefine the Supabase review-queue publisher above.

## Social / affiliate specialist paths

The repository also contains specialist social pipelines. They must not be used to infer the channel set or approval model of the canonical review-video publisher.

- `.github/workflows/daily-blindbox-product.yml` — validation-only; publishing is paused.
- `.github/workflows/labubu-buffer.yml` — validation-only; scheduling/publishing is paused.
- `docs/daily-product-pipeline.md` — documentation for the daily affiliate/social path.
- `docs/labubu-buffer-automation.md` — specialist Labubu/Buffer documentation.
- `docs/autonomous-video-pipeline.md` — documentation for the separate verified-product render path.

A subsystem document is authoritative only for that subsystem.

### Current social-channel decisions

- **Review-queue video:** YouTube + TikTok only. X/Twitter is parked by merged PR #227.
- **LinkedIn:** not an active production target. LinkedIn-capable daily-product code remains in the repository, but the daily workflow is validation-only with publishing paused.
- Other specialist pipelines may contain additional service support. That capability must not be read as an active production target unless the owning workflow is enabled and its current configuration proves it.

## Review-video upload paths

- **Canonical phone uploader:** `/media-upload` requests a signed Supabase Storage upload ticket through `/api/media/free-upload-ticket`, uploads under `media/review/*.mp4`, then stages the resulting HTTPS URL through `/api/owner/stage-review` into the Supabase review queue. See [`free-video-storage.md`](./free-video-storage.md).
- **Legacy Vercel Blob compatibility path:** `/api/media/review-upload` still uses Vercel Blob. The separate `lib/owner-review-staging.mjs` helper accepts only approved `*.public.blob.vercel-storage.com/media/review/*.mp4` URLs and dispatches `manual-reviewed-video.yml`.
- These paths are distinct. Do not infer the storage host or approval semantics of one from the other.

## Branch inventory

For the dated branch-cleanup snapshot and its reproduction commands, see [`BRANCH_INVENTORY.md`](./BRANCH_INVENTORY.md).

Deletion candidates are not deletion authorization. Re-run the safety gate immediately before any destructive cleanup.

## Branch rule

The repository has substantial historical branch accumulation. Therefore:

- `main` is the only default source for current behavior.
- An **open PR** represents proposed work, not production state.
- A closed or unmerged branch is historical unless raw evidence proves otherwise.
- Do not merge, resurrect, or delete historical branches merely because their names sound current.
- Branch deletion is destructive and requires an explicit cleanup review.

## Documentation-status rule

Every document that describes a runnable pipeline should state whether it is:

- **CANONICAL** — the current primary path for the named capability;
- **ACTIVE SPECIALIST** — current but scoped to one subsystem;
- **LEGACY / REFERENCE** — retained for history or a non-primary path.

If a protected path changes, update this file in the same PR.

## Required familiarization before writes

Before modifying a resumed or unfamiliar project:

1. read `AGENTS.md`;
2. read this file;
3. inspect current `main` and relevant open PRs;
4. trace the actual protected execution path;
5. classify claims as verified or unverified;
6. identify superseded documentation;
7. only then change code or docs.

## State vocabulary

Use the exact canonical vocabulary defined in [`AGENTS.md`](../AGENTS.md). Do not redefine it in this file.

## Drift check

Run:

```bash
npm run docs:state-check
```

The check is deterministic and local. It verifies the key documentation/publisher invariants without using credentials or making network calls.
