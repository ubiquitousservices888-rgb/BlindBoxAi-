# BlindBoxAI Current State

**Purpose:** prevent state/documentation divergence by giving humans and agents one canonical orientation point.

**Last reconciled:** 2026-09-26  
**Functional baseline inspected:** `main` at `7e0eaa0cc887aaadf3da25f56c44b6d668b9db29`

This file is an orientation map, not evidence. If this document conflicts with code, workflow definitions, raw command output, or observable production behavior, the latter wins and this file must be updated in the same change that resolves the conflict.

## Source-of-truth order

1. Observable production behavior plus complete raw evidence
2. Current files on `main`
3. This file
4. Subsystem documentation
5. Historical branches, closed PRs, old artifacts, and conversation summaries

Do not use an old branch as evidence of current behavior.

## Canonical owner-reviewed video path

The current Supabase review-queue publisher is:

`.github/workflows/publish-approved-reviews.yml`

Current invariants:

- trigger: `workflow_dispatch` only;
- default mode: `dry_run: true`;
- production video channels are pinned to `youtube,tiktok`;
- a run can target one exact channel with `publish_channel`;
- a run can target one exact approved row with `research_run_id`;
- the workflow calls `scripts/publish-approved-review-queue.mjs`;
- Buffer credentials are referenced by name only and must never be printed.

This is the canonical publisher when discussing an already-approved review-queue item.

## Other video paths are separate, not replacements

### Manual reviewed upload

`.github/workflows/manual-reviewed-video.yml`

This validates one exact uploaded MP4, waits at the `social-production` environment, then publishes the exact owner-reviewed upload. Its default video channels are also `youtube,tiktok`.

### Verified-product render pipeline

`.github/workflows/autonomous-video.yml`

This is a separate render → review → owner-approval → Buffer path for `data/verified-video-products.json`. It does not redefine the Supabase review-queue publisher above.

## Social / affiliate specialist paths

The repository also contains specialist social pipelines. They must not be used to infer the channel set or approval model of the canonical review-video publisher.

- `.github/workflows/daily-blindbox-product.yml` — product/social affiliate pipeline.
- `.github/workflows/labubu-buffer.yml` — Labubu specialist generation/validation path.
- `docs/daily-product-pipeline.md` — documentation for the daily affiliate/social path.
- `docs/labubu-buffer-automation.md` — specialist Labubu/Buffer documentation.
- `docs/autonomous-video-pipeline.md` — documentation for the separate verified-product render path.

A subsystem document is authoritative only for that subsystem.

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

Use only:

`CODED → COMMITTED → PUSHED → PR OPEN → CI PASSED → MERGED → DEPLOYED → LIVE VERIFIED`

"Done", "working", and "shipped" are not states.

## Drift check

Run:

```bash
npm run docs:state-check
```

The check is deterministic and local. It verifies the key documentation/publisher invariants without using credentials or making network calls.
