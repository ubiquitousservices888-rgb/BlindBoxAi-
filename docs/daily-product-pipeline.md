# Daily BlindBox product pipeline

The scheduled workflow stages exactly one unused `data/series/*.json` record, verifies its live BlindBoxAI CTA and generated social card, writes a review artifact, and then waits at the protected `social-production` GitHub Environment. Buffer credentials are referenced only by the protected publish job.

The state machine is persisted in one machine-managed GitHub issue and records `STAGED`, `PARTIAL`, `PUBLISHED`, and `FAILED`, plus Buffer channel post IDs. Products already staged, partially published, or published are excluded from new selection. Failed products may be retried on a later run.

The publisher uses Buffer's GraphQL endpoint at `https://api.buffer.com`. Production publishing is pinned to one explicit `BUFFER_ORGANIZATION_ID`; the API token may be able to see multiple organizations, but the pipeline queries channels and creates posts only for the configured organization. Duplicate detection follows Buffer cursor pagination through the entire 45-day search window before creating a post.

Autonomous image publishing currently supports X/Twitter, Instagram, Facebook, LinkedIn, Threads, Bluesky, and Mastodon. Pinterest is intentionally excluded until an explicit `boardServiceId` selection is configured because Buffer requires a board ID when creating a Pin. Every staged caption must contain the complete BlindBoxAI CTA and the affiliate disclosure before its approval hash is calculated.

## One-time setup

1. Merge the reviewed implementation PR.
2. Create a GitHub Environment named `social-production`.
3. Configure `@ubiquitousservices888-rgb` as a required reviewer. The publish script also verifies this protection rule through GitHub's environment API and fails closed if it is missing.
4. Restrict the environment to `main`.
5. Add `BUFFER_API_TOKEN` as an environment secret, not a repository secret.
6. Add `BUFFER_ORGANIZATION_ID` as an environment variable containing the exact Buffer organization/workspace ID that is allowed to publish.
7. Leave automatic publishing disabled until a manual `workflow_dispatch` run reaches the approval preview and the protected publish job behaves as expected.

No `.env` file, Buffer token, or other credential belongs in source, artifacts, issue state, or logs.
