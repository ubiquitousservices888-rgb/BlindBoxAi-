# Daily BlindBox product pipeline

The scheduled workflow stages exactly one unused `data/series/*.json` record, verifies its live BlindBoxAI CTA and generated social card, writes a review artifact, and then waits at the protected `social-production` GitHub Environment. Buffer credentials are referenced only by the protected publish job.

The state machine is persisted in one machine-managed GitHub issue and records `STAGED`, `PARTIAL`, `PUBLISHED`, and `FAILED`, plus Buffer channel post IDs. State lookup paginates GitHub issues instead of assuming the state issue is in the first 100 open issues. Products already staged, partially published, or published are never selected as new products.

Only `STAGED` blocks creation of the next daily candidate because that item is still waiting for the owner's approval. A `PARTIAL` result preserves all successful Buffer post IDs, retries only failed channels up to three times during the approved run, and does not deadlock future daily products if an external channel remains unavailable. The original failed publish job can be re-run for recovery while its artifact is retained.

The publisher uses Buffer's GraphQL endpoint at `https://api.buffer.com`. Production publishing is pinned to one explicit `BUFFER_ORGANIZATION_ID`; the API token may be able to see multiple organizations, but the pipeline queries channels and creates posts only for the configured organization. Duplicate detection follows Buffer cursor pagination through the entire 45-day search window before creating a post.

Autonomous image publishing currently supports X/Twitter, Instagram, Facebook, LinkedIn, Threads, Bluesky, and Mastodon. Pinterest is intentionally excluded until an explicit `boardServiceId` selection is configured because Buffer requires a board ID when creating a Pin. Every staged caption must contain the complete BlindBoxAI CTA and the affiliate disclosure before its approval hash is calculated.

## One-time setup

1. Merge the reviewed implementation PR only after CI and review are clean.
2. Create a GitHub Environment named `social-production`.
3. Configure **only** `@ubiquitousservices888-rgb` as the required reviewer and keep `prevent_self_review` disabled so the repository owner can approve the scheduled/manual deployment.
4. Use custom deployment branch policies and allow **only `main`**.
5. Keep `BUFFER_API_TOKEN` as an environment secret, not a repository secret.
6. Add `BUFFER_ORGANIZATION_ID` as an environment variable containing the exact Buffer organization/workspace ID that is allowed to publish.
7. Run one manual `workflow_dispatch` smoke test and inspect the exact staged preview before approving production publishing.

The publish script verifies the sole-reviewer rule and the main-only branch policy again at runtime and fails closed if either environment setting drifts.

No `.env` file, Buffer token, or other credential belongs in source, artifacts, issue state, or logs.
