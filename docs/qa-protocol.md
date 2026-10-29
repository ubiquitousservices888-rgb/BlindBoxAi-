# BlindBoxAI QA and deployment protocol

**Documentation status: ACTIVE SPECIALIST** — testing and deployment verification only. The owner-reviewed publisher remains defined by `docs/CURRENT_STATE.md` and `AGENTS.md`.

## Gates

| Layer | Command | Boundary and evidence |
| --- | --- | --- |
| Isolated modules | `npm run qa:unit` | Existing Node test suites plus negative architectural and Supabase project fixtures; deterministic and no external writes. |
| App boundaries | `npm run qa:boundaries` | Rejects references to the AgentAIIO sale app, public credential names, and transitive client imports of server credentials or Node-only modules. Runtime clients also reject a mismatched Supabase project before transmitting credentials or data. |
| Service integration | `npm run qa:integration` | Exercises actual HTTP requests against disposable loopback Supabase telemetry and Buffer GraphQL contracts. No production credentials, accounts, or data. |
| Browser end to end | `npm run build && npm run qa:e2e` | Browser follows tagged social landing → consent → analytics API → internal affiliate route → stubbed marketplace. Separate browser contexts prove no consent/campaign state crosses visitors. The browser blocks all other external hosts. The CI build uses a fake EPN campaign ID. |
| Deployment verification | `npm run qa:smoke` | On reviewed `main`, read-only GET checks production health revision and a public series page. It never follows an affiliate URL or changes queue/Buffer state. |

The release gate runs on PRs, pushes to `main`, manual dispatch, and once daily at 09:43 UTC. All jobs use read-only repository permissions. Existing Vercel Git integration creates preview deployments for branch pushes and deploys merged `main` to production. On push, the production smoke waits for the other gates to pass and retries while Vercel catches up. On schedule, it reports production health even when an unrelated test gate fails. There is no redundant daily redeploy of an unchanged commit. If `VERCEL_GIT_COMMIT_SHA` is unavailable on the deployed app, the smoke job fails rather than reporting an unverified revision as deployed.

GitHub's scheduled workflow can be delayed; its run history is the authority for whether a particular day's check occurred. A green local browser test proves the stubbed journey, not a real YouTube/TikTok publication or an EPN sale. Issue #234 remains an owner content and audience review gate before any live post.

## Running from Termux

`npm run video:test` also exercises false-200 private/deleted/consent responses, exact public media IDs, TikTok detail metadata, bounded response size/time and a disposable HTTP platform service. A public player metadata response is not proof of matching transcoded bytes or completed viewer playback. Unknown platform markup fails closed and requires reconciliation without republishing.

The fast, local layers need only Node 24 and the locked dependencies:

```sh
npm ci
npm run qa:boundaries
npm run qa:unit
npm run qa:integration
```

The browser layer runs in GitHub Actions on Linux, with its headless browser installed in CI; it does not require installing a desktop browser on the phone. `qa:smoke` needs a deployed health endpoint and a checked-out `main` revision, so its canonical result is the scheduled or post-merge Action run.

## Publication boundary

The QA schedule has no Buffer, owner, Supabase service-role, or Vercel deployment secrets. The existing validation job reads the EPN campaign secret for link construction; the browser job uses only a fake campaign fixture. Tests set their own loopback or fake service responses. The canonical `.github/workflows/publish-approved-reviews.yml` direct-dispatch path can publish an exact reviewed queue item; `.github/workflows/autonomous-video.yml` can also publish its exact approved queue row behind its existing `social-production` gate. The canonical workflow remains `workflow_dispatch` only. The owner-authenticated Blue action dispatches one exact serialized YouTube + TikTok run and approves only that run's `social-production` gate, while direct owner dispatch remains available for recovery and dry-run diagnostics. This QA protocol itself does not approve, claim, or publish an item.

## Release-gate failure investigation (no new AI charges)

The workflow `.github/workflows/ci-failure-investigation.yml` is a separate **read-only** GitHub Actions diagnostic, automatically triggered by a failed or timed-out `BlindBoxAI release gate`. An owner can also dispatch it against an exact numeric failed release-gate run ID from `main`.

It checks out trusted `main` with `persist-credentials: false`, and uses only `contents: read` and `actions: read`. It fetches authenticated GitHub run and job/step status metadata, validates the source repository and workflow, and writes fixed-category investigation suggestions to its own Actions Step Summary. It does not download raw logs, execute PR code, install npm dependencies, create PRs or comments, publish, deploy, call AI models, or touch Vercel, Supabase, Buffer, eBay, YouTube or TikTok.

The test suite `scripts/ci-failure-investigator.test.mjs` uses synthetic GitHub API fixtures and hostile metadata. It runs under `npm run release:test`. Triage suggestions are hypotheses, not verified root causes. The linked original job logs and exact SHA remain the evidence.

The separate `.github/workflows/ci-failure-doctor.md` is a **dormant GitHub Agentic Workflows blueprint**. No compiled `.lock.yml`, model inference permission, or billing path is enabled. Activating AI requires owner approval of a specific inference provider and spending, a reviewed and compiled gh-aw lock file, and a new reviewed PR. This draft does not run.

GitHub currently provides standard GitHub-hosted runner time free in public repositories. This is not authorization for charged model inference or larger runners.
