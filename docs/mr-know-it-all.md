# Mr. Know It All

Mr. Know It All is BlindBoxAI's evidence-first collector assistant. It covers the whole blind-box and designer-toy category, including POP MART and non-POP MART brands. The system deliberately separates two modes:

1. optional public, read-only collector Q&A at `/ask`;
2. private, twice-daily deterministic demand analysis for the BlindBoxAI owner.

The system has no purchase, bid, checkout, payment, enrollment, outreach, rendering, publishing, or account-control permission. It cannot create a financial transaction.

## Permission boundary

| Capability | Public Q&A | Private scheduled analysis | Automatic side effect |
|---|---:|---:|---:|
| Read reviewed BlindBoxAI series data | Yes | Demand metadata only | None |
| Search current public web sources | Yes, when enabled | No | None |
| Answer collector questions | Yes, when enabled | N/A | Answer only |
| Classify private collector demand | Encrypted input | Yes | None |
| Create verified affiliate/publishing action automatically | No | No | Never |
| Buy, bid, pay, enroll, contact, render, or publish | No | No | Never |
| Guarantee profit, value, authenticity, or zero risk | No | No | Never |

The daily-product and video pipelines remain separate. A Mr. Know It All result cannot enter either pipeline automatically.

## Optional public collector Q&A

`POST /api/mr-know-it-all` accepts one JSON field, `question`, with a 600-character maximum. It stays disabled unless `MR_KNOW_IT_ALL_ENABLED=true`.

When deliberately enabled, public Q&A uses a server-only OpenAI API key for evidence-first answers and current web search. It blocks secret extraction and transaction/outreach requests, includes reviewed positive-USD catalog records only, returns HTTPS citations for current facts, and records only a privacy-redacted encrypted demand event. No visitor identity profile, payment data, full answer, or conversation thread is stored.

This optional public feature is not required for the scheduled private workflow. If the owner does not want model/API cost, leave `MR_KNOW_IT_ALL_ENABLED=false` and do not fund the optional Q&A path.

## Free twice-daily private demand analysis

`.github/workflows/mr-know-it-all-research.yml` runs at `02:17` and `14:17` UTC. This scheduled path does **not** use GitHub-hosted AI agents, GitHub AI Credits, an OpenAI API key, or an OpenAI research model.

The runner:

1. loads recent privacy-redacted question events from the dedicated private Vercel Blob store;
2. decrypts them in memory with `MR_RESEARCH_ENCRYPTION_KEY`;
3. applies deterministic local intent rules for authenticity, price/resale, releases, pull odds, buyer intent, series guides, and uncategorized collector demand;
4. deduplicates repeated identical questions before counting demand;
5. produces demand themes only; it does not invent current market evidence or automatically promote an unverified opportunity;
6. encrypts the complete report with AES-256-GCM;
7. writes and uploads only `*.json.enc` for 14 days.

Because current external facts are not researched by a paid model in this free path, fresh market, affiliate-program, and transaction evidence must be verified separately before a candidate can pass the existing owner-review opportunity gate. This preserves the evidence standard instead of replacing missing research with guesses.

Plaintext private questions and reports are never uploaded as workflow artifacts. Workflow logs receive no plaintext question content, brand, source, opportunity, score, or candidate count.

## Private storage

Use a dedicated **private** Vercel Blob store for question demand. Do not reuse the public evidence store.

Required values for the scheduled workflow:

- `MR_PRIVATE_BLOB_READ_WRITE_TOKEN` — GitHub Actions secret and Vercel server environment;
- `MR_RESEARCH_ENCRYPTION_KEY` — GitHub Actions secret, Vercel server environment, and the owner's private local environment.

Generate the encryption key in a trusted local terminal and save it in a password manager:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Download an encrypted workflow artifact into the project and decrypt it locally with:

```bash
npm run mr:decrypt -- --input output/mr-know-it-all/private-research-....json.enc
```

Do not paste decrypted owner reports into a public issue, pull request, workflow log, or tracked file.

## Opportunity gate

The existing evidence gate remains authoritative for any separately researched candidate:

| Status | Meaning |
|---|---|
| `READY_FOR_OWNER_REVIEW` | Low-risk review candidate with matching private demand, official evidence, recent transaction evidence, sufficient fresh sources, positive-USD observations, and an identified inbound monetization path. |
| `RESEARCH_ONLY` | Potentially useful but evidence, sample size, or risk is not strong enough for owner action. |
| `REJECTED` | Missing required proof, missing program evidence, stale evidence, unsafe claims, or another hard blocker. |

`READY_FOR_OWNER_REVIEW` is not approval and does not mean profitable or risk-free. Human approval remains mandatory.

## Configuration

Server-only values must never use a `NEXT_PUBLIC_` prefix.

| Name | Location | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Vercel only, optional | Authenticates public Q&A only when deliberately enabled. Not used by scheduled research. |
| `OPENAI_QA_MODEL` | Vercel, optional | Public Q&A model selection. |
| `MR_KNOW_IT_ALL_ENABLED` | Vercel | Leave `false` for the no-model-cost configuration. |
| `MR_PRIVATE_BLOB_READ_WRITE_TOKEN` | Vercel + GitHub Actions | Dedicated private store for encrypted question-demand events. |
| `MR_RESEARCH_ENCRYPTION_KEY` | Vercel + GitHub Actions + owner private environment | Encrypts question events and owner reports. |
| `MR_KNOW_IT_ALL_OUTPUT_DIR` | Workflow/local environment | Ignored directory for encrypted report output. |

The scheduled deterministic analysis requires no `OPENAI_API_KEY` and no `OPENAI_RESEARCH_MODEL`.
