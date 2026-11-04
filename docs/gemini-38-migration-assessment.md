# Gemini 3.8 Flash migration: capability and spending assessment

**Date:** 2026-10-20  
**Status:** AUDIT + PROPOSED OMNI REST PARSER REPAIR; **not a 3.8 Flash runtime migration**  
**State:** CODED / COMMITTED on a review branch; CI, merge, deployment and real video behavior must be evidenced separately. Only disposable mocked request/response tests were run; no actual Gemini API request, charge, merge, deployment or live video was authorized or performed.

## Decision: do not replace Gemini Omni in the MP4 renderer with a text-only model

Google documents `gemini-3.8-flash` as accepting video inputs but producing **text output**. Google's separate `gemini-omni-1.1-flash` produces **video output**. Therefore changing `lib/gemini-video-renderer.mjs`'s model to 3.8 Flash would make the existing video decoder fail closed (or break video rendering). Keep video generation on its own model/cost gate. Do not pretend that a new environment variable turns 3.8 Flash into a renderer.

**Official primary sources:**
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash
- https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8
- https://ai.google.dev/gemini-api/docs/omni
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/structured-output

## Read-only call-site inventory (GitHub default-branch code search)

Searches: `gemini`, `generativelanguage`, `@google/genai`, `@google/generative-ai`, `GEMINI_`. Results are repository code-search evidence, **not** a complete local `git grep` of all tracked files; repeat on a complete checkout before claiming exhaustive coverage.

| Path | Responsibility | Model ID | Credential reference | Scope |
|---|---|---|---|---|
| `lib/gemini-video-renderer.mjs` | POST `/v1beta/interactions`, response video/MP4 | `gemini-omni-1.1-flash` | `apiKey` argument, required | server-side Node.js module |
| `scripts/gemini-video-stage.mjs` | Supplies renderer key, uploads MP4 to Vercel Blob | indirect Omni | `process.env.GEMINI_API_KEY` | GitHub Actions/Node script |
| `.github/workflows/gemini-video-stage.yml` | Manual review-only render job | indirect Omni | `secrets.GEMINI_API_KEY` | GitHub Actions secret |
| `.github/workflows/autonomous-video.yml` | Render job on source-data push or manual dispatch | indirect Omni | `secrets.GEMINI_API_KEY` | GitHub Actions secret |
| `scripts/gemini-video-renderer.test.mjs` | Disposable video-response mock | mock Omni | non-real fixture | unit tests |
| `docs/autonomous-video-pipeline.md` | Documentation only | none | secret name only | no API request |
| `.env.example` | Environment variable documentation only | none | placeholder name only | no secret value |
| `scripts/video-handoff-config.test.mjs` | Workflow boundary tests | none | name-only assertions | tests |
| `tools/diagrams/blindbox_architecture.py` | Architecture drawing | none | none | no API request |

No 3.8 Flash text-generation or structured-classification runtime call was found by these searches on current `main`; no `@google/genai` or `@google/generative-ai` import was found. Text classification must not be claimed migrated. Future classification could use `GEMINI_MODEL` defaulting to `gemini-3.8-flash` **only after** a real, scoped call site is approved and implemented.

**Secret-scope mismatch:** The owner's report that `GEMINI_API_KEY` is configured in Vercel Production does not establish that the separate **GitHub Actions** secret exists or works. These workflows consume GitHub repository secrets. A Vercel redeploy by itself cannot verify this pipeline or show model invocation. Never copy secret values into docs, issue text, logs or comments. Also verify that no future Gemini key is exposed through `NEXT_PUBLIC_` variables.

## 3.8 Flash settings for a future approved text consumer

The official Interactions API recommends `model: "gemini-3.8-flash"`, `generation_config.thinking_level` in `low`, `medium`, `high`; `max_output_tokens` is a hard limit including thinking tokens, so handle `incomplete` as a failure rather than accepting partial schema. Structured JSON uses `response_format: {type: "text", mime_type: "application/json", schema: ...}`. Remove `temperature`, `top_k`, `top_p` and unsupported `candidate_count` from 3.8 requests. The **Omni video call** does not use those text-generation settings.

For an actual future text classification consumer, require a narrow `EBAY|AMAZON|BOTH|NONE` JSON enum/schema, local schema re-validation, bounded output, low thinking for tagging and high thinking for source reasoning, server-only system data rules, bounded timeout, retry/backoff on 429/5xx, and fail closed on missing key, malformed output, or insufficient evidence. Use sold comparables rather than asking prices; never substitute lot/bundle sales for singles; clearly label unsupported prices and stats UNVERIFIED. Do not enable an unreviewed production call or substitute an unrelated model. These are **requirements, not implemented capabilities**.

## Cost / approval gate

- Google's 3.8 Flash standard free tier may apply within an eligible project's limits; actual billing/usage status is unverified. A Vercel API key is not evidence of free tier.
- Standard paid introductory prices **through 2026-12-31**: $0.75 per million input tokens and $3.75 per million output tokens (thinking included). From **2027-01-01**: $1.50 input and $7.50 output.
- Existing Gemini Omni Flash **video** is paid-only, approximately $0.10/second for 720p generated output, excluding other charges; a 3–10 second illustrative clip is approximately $0.30–$1.00 video output, not an approved charge.
- Expected current 3.8 Flash runtime requests/day from inspected production app: **0**, because no live text call site was found. Actual Omni calls/day **UNKNOWN**; render actions depend on source-data pushes, manual triggers, configured credentials and provider fallback. No actual token usage metrics or billing evidence were available.
- Illustrative **not forecast**: 10 future text requests/day × 30 days × 2,000 input + 500 output tokens = 0.6M input + 0.15M output = **$1.01/month** introductory / **$2.03/month** starting 2027 if all requests are billed; free-tier usage can reduce this and thinking-token output can increase it.
- **Gate:** no paid requests, test renders, newly scheduled work, enlarged throughput, or silent fallback without the owner's explicit approval of the named action and maximum amount. In particular, the existing workflow currently configures Gemini fallback when credentials are available; review that separately before enabling any billable Gemini account.

## Separate pending OpenHands model configuration (overlap check)

Open PR [#283](https://github.com/ubiquitousservices888-rgb/BlindBoxAi-/pull/283) adds a GitHub Actions OpenHands coding agent configured using distinct `LLM_API_KEY` and `LLM_MODEL` secrets. Its proposed Python allowlist currently names Gemini **2.5 Flash** models, not 3.8 Flash; it is **not yet on main**, so the main-branch application call-site inventory above must not be conflated with it. It does not inherit `GEMINI_API_KEY` from Vercel Production. Review #283 separately before merge and reconcile its provider/model support through a dedicated, documented SDK test, avoiding overlapping edits across PRs.

## Validation and release blockers

1. **Capability mismatch:** currently no text-generation consumer to migrate. Decide the precise text consumer first and keep Omni video separate.
2. **Cost gate:** owner must approve any paid render separately; $0 not established for Omni.
3. **Independent Claude audit:** required before claims that a protected API path is fit to merge.
4. **Disposable pre-change E2E and preview:** no live Gemini request or preview MP4 is claimed in this audit. A model-specific code change must pass these before merge.
5. **Production proof:** Vercel Ready or CI success cannot be called LIVE VERIFIED; capture model/endpoint usage, bounded request receipt, verified output, and deployment revision without secret values.

## Scoped remediation included in this PR

The existing raw HTTP Gemini Omni renderer expected `interaction.output_video.data`, which Google's documentation says exists **only in SDK responses**; the raw REST format places MP4 base64 at `steps[].content[]` within a completed `model_output`. A disposable mock of the documented REST response reproduced the prior failure:

```
BASELINE_EXPECTED_FAIL_TYPE: Error
BASELINE_EXPECTED_FAIL_MESSAGE: Gemini Omni returned no usable video data
BASELINE_UPLOAD_CALLS: 0
```

The proposed repair to `lib/gemini-video-renderer.mjs` parses and validates the raw REST response, requires `completed` status and the exact Omni model, enforces single MP4 output and size bounds, sets a request timeout, and moves the API key to the standard `x-goog-api-key` header instead of a URL query parameter. Existing Gemini video prompt, vendor and rendering approval workflow remain unchanged. There are deliberately no automatic video retries, since 429/5xx retries can create ambiguous billable render attempts without a verified spend ceiling.

Local disposable post-fix mocked evidence:

```
FIXED_RAW_REST_MOCK: PASS
FIXED_WRONG_MODEL_OR_INCOMPLETE_OR_TEXT: FAIL_CLOSED
```

The repository's normal video test suite also adds raw REST success and rejection regression cases. This is **only a code repair proposal**, not evidence that production actually renders or that its key is valid.

**Remaining known risk:** The workflows have an existing Creatomate/Gemini fallback path with no verified per-render dollar ceiling. Do not activate billable credentials or dispatch renders to validate this PR without the owner's separate explicit amount approval. A further narrowly scoped cost enforcement change requires an approved budget definition and its own disposable E2E gate.

This change does **not** add a text Gemini runtime consumer, change the model to 3.8, add schedules or secrets, or authorize deployment, video rendering, publishing, or spending. It preserves the existing capable video model while preventing the confirmed REST decoding mismatch.
