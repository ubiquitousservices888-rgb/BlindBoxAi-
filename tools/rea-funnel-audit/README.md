# REA research and offline C++ evidence audit

Status: research diagnostic; no production integration or verified financial result.

This tool applies the separation of clicks, conversions, money and publication
receipts to exported BlindBoxAI evidence. Its C++17 core detects conflicting
transaction amounts, attribution, status and stored provider receipt identities.
It quarantines a disputed identity instead of choosing whichever row came first.
The Node adapter accepts existing funnel-event JSON or the dated review-receipt
snapshot format. It never calls a provider, changes a queue, publishes, imports
financial evidence or loads credentials.

## Use

Tested on Linux with Node 24 and a C++17 compiler available as `c++`. No new npm package or
REA installation is needed to run the diagnostic. Compilation uses a disposable
temporary directory and strict compiler warnings; generated binaries are removed.

```sh
npm run funnel:test
node tools/rea-funnel-audit/audit.mjs --input data/stuck-review-video-receipts-20261115.json --kind export
node tools/rea-funnel-audit/audit.mjs --input /absolute/path/to/exported-events.json --kind export
```

`--kind fixture` is required for synthetic data. `--kind export` labels input as
an **UNVERIFIED_EXPORT**, including when its rows claim production or provider
confirmation. Neither option authenticates an export or establishes live state.
The report contains an exact input SHA-256. Input is bounded to a regular file
of 5 MiB and 10,000 rows. The child compiler and executable receive only a minimal
PATH/locale environment, and are invoked without a shell. Errors never echo the
input, provider identities or compiler output.

The accepted event shape is a JSON array or `{ "events": [...] }`, with the
existing `lib/funnel-events.mjs` field names. Only explicitly production,
`test: false`, `provider_conversion` records with bounded provider/evidence IDs
enter identity comparison. Clicks cannot become conversions. Missing or invalid
identity rows are counted separately and excluded. Monetary values must be
nonnegative exact cents within the existing safe range. Negative adjustments,
nonconfirmed observations, malformed amounts, explicit non-USD currency and
disagreement on Custom ID quarantine the complete identified transaction.
Confirmed and reconciled statuses can agree; they are not proof of payout.

`consistentReportedAmountCents` is a diagnostic subtotal of supplied consistent
rows, in integer cents. It is **not authenticated revenue, cash, profit, an EPN
import, or lifetime reconciliation**. The tool does not verify EPN Custom ID
allowlists, account/report authenticity, date freshness, transaction line-item
semantics, bank payouts or channel playback. Feed a consolidated event export,
not raw multi-item EPN Transaction Detail rows. Missing Custom IDs are counted
as unattributed. The output always reports authentication/publication as
unverified and cash/profit as unknown. Differing historical snapshots require
provider reconciliation; this tool does not select a latest or profitable row.

Receipt input must have schema `blindboxai.stuck-review-receipts/v1`, a `rows`
array and the existing `research_run_id`, `buffer_post_ids`, optional `public_urls`
fields. Counts describe stored field presence. A stored URL is only a candidate;
it is never fetched or declared public. Missing or contradictory receipt fields
identify records needing reconciliation. A complete stored pair still requires
independent provider, source and public-player verification.

## Research completed before implementation

The official project is [morluto/rea](https://github.com/morluto/rea), MIT licensed.
The GitHub page showed approximately 467,000 stars when inspected on November 18,
2026. This is a snapshot, not an independently measured growth rate or proof of
software quality, income or BlindBoxAI demand. The similarly named iologik/REA
repository is a fork.

REA 6.9.0 was acquired separately with npm lifecycle scripts disabled and optional
dependencies omitted. Its local CLI statically analyzed these pinned modules:

| Target | Source revision | Selected module | Finding supported by source inspection |
| --- | --- | --- | --- |
| Dub | `6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e` | `apps/web/lib/api/conversions/track-sale.ts` | Invoice-scoped idempotent responses, customer/click association and workspace checks precede recording a sale. |
| Postiz | `a63809174197e562dde5fe003aee93e8deacd8a1` | `libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts` | Resumable upload session state and returned video identity are distinct from ancillary title/thumbnail failures. |
| BlindBoxAI | `f4f8f3341595e65a29901ea37446509ab95e0da5` | `lib/funnel-events.mjs` | Production/test separation and provider tuple keys already exist; differing repeated amounts currently retain the first eligible observation. |

`study-manifest.json` records the exact selected-source hashes and REA Evidence
IDs/hashes, including forward semantic traces of `invoiceId`, `uploadUri` and
`dedupedConversions`. Those traces returned ambiguous/partial coverage, not proof
of complete behavior. Analysis is partial and static: unselected modules and runtime/provider
behavior remain unknown. No native binary was decompiled and no live social or
payment operation was attempted. REA does not automatically return a production
C++ rewrite: it supplies observations and pseudocode; implementation and tests
remain separate work.

The first-observation behavior is explicitly covered by an existing funnel unit
test. This research flags that design conflict; it does not silently alter the
existing aggregator or describe the edge case as an observed financial loss.
Repository search found only that module definition and its tests referencing
`aggregateFunnel` at the pinned baseline. The offline tool is a separate audit
surface, not a new production accounting implementation.

## Working-product comparison and adoption order

These are deployed products with public documentation and source; customer
counts, revenue claims and testimonials are vendor assertions, not independently
audited financial evidence. No product was purchased or provisioned.

| Priority | Reference | Relevant behavior | BlindBoxAI application | License/cost boundary |
| --- | --- | --- | --- | --- |
| 1 | [Dub attribution](https://dub.co/docs/concepts/attribution) | Separate click, lead and sale identities; invoice idempotency | Keep campaign/Custom ID joins and quarantine contradictory supplied evidence; obtain actual EPN reports for conversion proof | AGPLv3 outside named enterprise directories; enterprise code has a commercial license. Existing provider reports remain authoritative. |
| 2 | [Postiz](https://postiz.com/) | Queue, provider adapters and recoverable upload identities | Reconcile the existing accepted post ID before any retry; preserve Blue and public proof | AGPL-3.0. Self hosting still requires infrastructure and platform app authorization; no Buffer replacement approved here. |
| 3 | [Ghost memberships](https://docs.ghost.org/members) | Confirmed email membership and Stripe-linked paid access | Finish the single existing Pro implementation and actual email/webhook proof | MIT application; hosting/email and Stripe processing costs remain. Pro PR #331 already owns this scope. |
| 4 | [Umami](https://umami.is/) | Campaign/event/funnel reporting | Present observed visits and clicks separately from provider-confirmed results | MIT. Existing consent-gated PostHog path already covers much of this; adding a second analytics stack has no demonstrated benefit. |
| 5 | [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | Selected-element changes and restock alerts | Apply content-diff/freshness methods to already-approved source checks | Apache-2.0. Self hosting consumes compute; hosted subscription costs money. A page change does not establish a completed sale. |

Rewriting or translating third-party code to C++ does not remove its license
requirements. No Dub, Postiz, Ghost, Umami or changedetection source is copied,
translated or vendored in this change. The diagnostic is original code for
BlindBoxAI's existing evidence schema and owner financial-truth requirements.
There is no basis here to claim a blanket license clearance for future reuse.

## Revenue tests and stop/continue criteria

| Opportunity / who pays | Demand evidence and problem | Acquisition / conversion | Cheap next test | Cost / main risk | Continue / stop |
| --- | --- | --- | --- | --- | --- |
| EPN affiliate funnel / network pays commission on qualifying sales | Existing content and click telemetry show activity; profitable demand remains unverified | Existing YouTube/TikTok -> owned series page -> EPN; attributed provider order | Reconcile one exact stored public video receipt and join its existing Custom ID to an authentic report | Existing stack and operator time; attribution mismatch or report access | Continue after valid provider joins; stop revenue claims when proof is missing/conflicting |
| Collector Pro / collector pays subscription | Existing Pro code and free tools; paid willingness is unverified | Existing collector content -> Pro -> paid subscription | Complete #331's actual auth/email/webhook readiness and one legitimate paid customer journey when enabled | Existing infrastructure plus actual processing fees; overlapping receivers or missing email | Continue on real activation and retained demand; stop opening payment gates while required proof is missing |
| Digital guide / collector pays for guide | Existing draft sales page #320; delivery and paid demand remain unverified | Existing guide CTA -> Gumroad -> delivered file | Verify the advertised complete deliverable and real checkout/delivery readiness | Existing asset preparation; payout or delivery block | Continue after product/delivery proof; hold launch while claims cannot be verified |
| Restock/research alerts / future paying collector | Working monitoring products show category demand, not BlindBoxAI-specific demand | Permission-based signup -> useful alert -> potential paid tier | Measure genuine opted-in demand using the existing site before adding services | Time, source rights and false alerts; no new paid inference budget | Continue only with genuine requests and reliable dated source changes; otherwise defer |

First practical result: the November 15 saved snapshot contains five provider IDs
and no stored public URL candidates. This is historical repository evidence, not
a November 18 production database query. Reconciliation through the existing
`scripts/reconcile-stuck-video-receipts.mjs` path is the next evidence step; another
publisher or another render would not settle those records. No current provider
order, payout, profit, or newly published video is established by this research.

## Release verification boundary

The existing `npm run build` stopped after generating the application because
Next 16.4.2 reported a security upgrade notice. npm audit independently identified
GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8; the upstream advisories list 16.4.5
as patched. Scope therefore includes an exact 16.4.6 patch update and matching
lockfile, while retaining the existing framework and infrastructure.

Baseline unit/service tests passed before that update. The disposable browser
journey was attempted first but could not start locally: the browser download was
truncated and installed Chromium was denied a process-singleton socket. No socket
policy was altered. Final hosted release-gate browser results are required before
merge readiness; local compilation, source tests or a draft PR are not substitutes.
This tool adds no production route, schedule, billing flow or deployment change.
