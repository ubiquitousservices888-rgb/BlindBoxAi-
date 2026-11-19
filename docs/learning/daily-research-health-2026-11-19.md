# Daily research health-check recovery — 2026-11-19

## Observed failure
- Scheduled run: https://github.com/ubiquitousservices888-rgb/BlindBoxAi-/actions/runs/44402818067 (attempt 1, failed).
- Failed job step: `Check live pages, revision, and price dates without production writes`.
- `scripts/daily-research-check.mjs` compares live `/api/health` revision against the checked-out `GITHUB_SHA`, in addition to read-only page checks.

## Diagnosis and action
- GitHub main revision: `f4f8f3341595e65a29901ea37446509ab95e0da5`.
- Before correction, Vercel's `blindboxai.com` production alias referenced feature-branch revision `89c97aeda24d68deee6aa31d57aabd73f4a26236`.
- With explicit owner approval, existing READY deployment `dpl_VJDYgLSeRZ1z26UVDuYoiWfCsjJk` from main was promoted. Subsequent Vercel readback confirmed the production aliases on that deployment.
- Re-ran only failed jobs for run `44402818067`.

## Outcome
- Attempt 2: `completed`, `success`; `check` job passed. Source: https://github.com/ubiquitousservices888-rgb/BlindBoxAi-/actions/runs/44402818067
- This supports the deployment-revision mismatch as a likely cause; the original log's exact error string was not retrieved, so root-cause certainty is limited.
- No affiliate redirects, queue writes, renders, public video posts, or paid activity were initiated by this recovery.

## Reusable learning and guardrails
1. Before retrying a live revision-sensitive health check, compare GitHub main SHA with the Vercel production alias commit SHA.
2. If different, investigate why; do not loosen the revision assertion or blindly redeploy.
3. Promote only a verified READY deployment with explicit owner approval and retain the previous deployment for rollback.
4. Verify the production alias readback, then rerun only failed jobs and record pass/fail evidence.
5. A successful retry verifies the check now passes; it does not prove video publishing or revenue.
6. Preserve both failed and successful attempts for AI Family Core learning; AI Family Core may recommend improvements but has no independent production authority.

Status: evidence recorded on a review branch only; not merged or deployed.
