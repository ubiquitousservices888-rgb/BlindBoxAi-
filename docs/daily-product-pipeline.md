# Daily BlindBox product pipeline

The scheduled workflow stages exactly one unused `data/series/*.json` record, verifies its live BlindBoxAI CTA and generated social card, writes a review artifact, and then waits at the protected `social-production` GitHub Environment. Buffer credentials are referenced only by the protected publish job.

The state machine is persisted in one machine-managed GitHub issue and records `STAGED`, `PARTIAL`, `PUBLISHED`, and `FAILED`, plus Buffer channel post IDs. Products already staged, partially published, or published are excluded from new selection. Failed products may be retried on a later run.

The publisher uses Buffer's GraphQL endpoint at `https://api.buffer.com`, discovers connected organizations/channels at runtime, and only attempts conservative image-compatible services. Before creating a post it queries recent Buffer posts for an exact-caption match so a retry does not duplicate an already-created post.

## One-time setup

1. Merge the reviewed implementation PR.
2. Create a GitHub Environment named `social-production`.
3. Configure `@ubiquitousservices888-rgb` as a required reviewer. The publish script also verifies this protection rule through GitHub's environment API and fails closed if it is missing.
4. Restrict the environment to `main`.
5. Add `BUFFER_API_TOKEN` as an environment secret, not a repository secret.
6. Leave automatic publishing disabled until a manual `workflow_dispatch` run reaches the approval preview and the protected publish job behaves as expected.

No `.env` file, Buffer token, or other credential belongs in source, artifacts, issue state, or logs.
