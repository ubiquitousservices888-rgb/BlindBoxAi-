# Mr. Know It All

**Documentation status: CANONICAL** for collector questions and scheduled research.

The earlier description of paid public AI answers, a 600-character request limit,
and scheduled private Blob analysis was superseded by the deterministic public
route and Supabase-backed research queue. The implementations listed below are
current authority. Private Blob utilities remain legacy/reference helpers.

## Customer and owner collector questions

`POST /api/mr-know-it-all` accepts `question` or `query`, 2–120 characters.
`/ask` is the public interface. The owner can use the same collector research
interface; this route does not expose private operational information or accept
owner commands.

1. Reviewed completed-sale records are searched deterministically. At least two
   documented completed sales are required; dated prices remain historical.
2. The existing server-only stored public-research lookup searches recent runs.
3. When matching leads are missing, stale, or have unknown dates, a bounded
   credential-free question search retrieves Google News RSS. Only articles
   identifying an approved collectible publisher are admitted. This is source
   discovery, not article-content verification or a generated factual answer.
4. Publication dates and retrieval timestamps are shown separately. A lead is
   fresh only when both dates are valid, retrieval is within 48 hours, and
   publication is within 30 days. Future or missing dates are unknown.
5. The existing redacted question recorder retains research demand and queues
   missing sold evidence. Question-specific discovery results are cached in
   server memory, not persisted to the database as verified facts.

Queries with detected private/credential material or no recognized collectible
category are not sent to the external search. The interface discloses external
search and asks customers to exclude private information. This detection is not
an identity or personal-data guarantee; users must submit public product terms.

No hosted model or paid agent is enabled by this feature. Search is limited to
one fixed HTTPS RSS endpoint, an eight-second deadline, 256 KB of response data,
and six approved-source leads. Redirects are blocked. Per server instance,
identical in-flight searches are combined, results are cached for 15 minutes
(failures for one minute), and at most six distinct searches start per minute.
These bounds are **not** a distributed global quota. Cold starts and multiple
instances can each issue searches. Existing endpoint rate limits also apply.

If a refresh fails or retrieves no approved source, previous research is retained
with its dates. Empty retrieval is never proof that a market or answer does not
exist. Research leads cannot replace price evidence, authorize an action, or
enter a publishing workflow.

## Existing scheduled research

| Workflow | UTC schedule | Responsibility |
|---|---|---|
| `know-it-all-public-research.yml` | 02:17 and 14:17 daily | Credentialless category discovery, sanitized artifact, existing GitHub OIDC persistence |
| `mr-know-it-all-tool-bot.yml` | Every six hours at minute 17 | Existing bounded research queue and strict completed-sale provider lookup |
| `bounded-operations.yml` | 06:17 and 18:17 daily | Repository safety, evidence and dependency checks |
| `daily-research-check.yml` | 13:37 daily | Affiliate URL audit, live page/revision checks, documented sale-date freshness report |

The new daily check runs at 08:37 Central daylight time / 07:37 Central standard
time. GitHub scheduling can be delayed; timestamps in its report show actual
retrieval time. Scripts run on hosted runners independently of a phone.

The daily report appears in the Actions run summary and as the
`daily-research-check` JSON artifact for 14 days. It checks at most twelve reviewed
series pages. Affiliate auditing verifies repository URL construction; it does
not click tracked links or prove commission attribution in provider reports.
Stale price counts request attention; they do not automatically rewrite prices.
Failed page/revision probes or affiliate audits fail the workflow.

Category research fails before persistence if no usable findings were retrieved,
retaining previous stored research rather than publishing a false empty snapshot.
The completed-sale worker still requires its configured approved provider.
This change adds no provider, purchase, model, or paid render.

## Configuration and access boundaries

The existing stored-research reader uses `SUPABASE_URL` and the server-only
`SUPABASE_SERVICE_ROLE_KEY`. Question recording uses the existing authorized
Edge ingest path (`EVIDENCE_UPLOAD_CODE`). Existing scheduled research persistence
and queue workers use GitHub OIDC. The completed-sale provider references
`THE_CARD_API_KEY` by name. The new RSS fallback and daily health report need no
new secret, schema, migration, or account.

No secret values belong in logs, reports, source files, or client components.
Public question research has no ability to deploy, buy, bid, pay, send outreach,
render, publish, or change account credentials. Existing Blue owner approval
remains authoritative for public publication.

## Verification

Run `npm run mr:test`, `npm run docs:state-check`, the repository release checks,
and the read-only daily report. Mocked tests verify approved publishers,
cache/budget behavior, privacy rejection, retained stale evidence, and absence
of production writes. A passing unit test is not proof of configured production
storage, provider access, successful scheduled runs, or a live deployment.
