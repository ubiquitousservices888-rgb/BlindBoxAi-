# Mr. Know It All

Mr. Know It All is the evidence-first BlindBoxAI agent. It covers the whole blind-box and designer-toy category, including POP MART and non-POP MART brands. It runs as one agent in two isolated modes:

1. public, read-only collector Q&A at `/ask`;
2. private, twice-daily demand analysis and inbound marketing research for the BlindBoxAI owner.

The agent has no purchase, bid, checkout, payment, enrollment, outreach, rendering, publishing, or account-control tool. It cannot create a financial transaction. It can explain evidence and prepare a reversible proposal for owner review.

## Permission boundary

| Capability | Public Q&A | Private research | Automatic side effect |
|---|---:|---:|---:|
| Read reviewed BlindBoxAI series data | Yes | Yes | None |
| Search current public web sources | Yes, when needed | Yes | Read-only search |
| Answer POP MART, blind-box, toy, series, price, release, and fake-check questions | Yes | N/A | Answer only |
| Identify knowledge-base, affiliate, or video candidates | Explanation only | Yes | None |
| Record privacy-redacted question demand | Encrypted private blob | Owner-only input | None |
| Record private candidate evidence | No public access | Owner-encrypted artifact | None |
| Buy, bid, pay, or check out | No | No | Never |
| Enroll in an affiliate program | No | No | Never |
| Contact a brand, seller, sponsor, or customer | No | No | Never |
| Render or publish a video/social post | No | No | Never |
| Guarantee profit, value, authenticity, or zero risk | No | No | Never |

The existing daily-product and video pipelines remain separate. A Mr. Know It All result cannot enter either pipeline automatically.

## Public collector Q&A

`POST /api/mr-know-it-all` accepts one JSON field, `question`, with a 600-character maximum. The route:

- stays disabled unless `MR_KNOW_IT_ALL_ENABLED=true`;
- keeps the OpenAI key server-only;
- accepts same-origin browser requests;
- applies a six-request-per-minute in-process abuse limit;
- caps body size and model turns, disables SDK tracing, and returns no raw errors;
- includes only reviewed positive-USD catalog records in its local context;
- uses current web search for time-sensitive facts and returns HTTPS citations;
- privacy-redacts the question and stores only an encrypted demand event in a private Vercel Blob;
- stores no visitor identity, IP address, cookie, account profile, full answer, or conversation thread.

The stored event contains the redacted question plus answer confidence, current-as-of time, and citation domains. It exists only to identify aggregate knowledge-base, video, and affiliate demand. The page tells visitors not to submit personal or payment data; obvious email, phone, payment-card, and credential patterns are removed before encryption.

For production, also configure a Vercel Firewall rate-limit rule for `/api/mr-know-it-all`; the in-process limit is a backstop, not a distributed quota.

OpenAI states that API inputs and outputs are not used to train models by default unless the organization opts in. Standard API data may still be retained for abuse monitoring under the account's data-control settings; see [OpenAI platform data controls](https://developers.openai.com/api/docs/guides/your-data).

## Private twice-daily research

`.github/workflows/mr-know-it-all-research.yml` runs at `02:17` and `14:17` UTC, twelve hours apart. It decrypts up to 250 recent privacy-redacted questions in memory, clusters what collectors are actively asking, and verifies source-backed inbound opportunities across:

- knowledge-base additions that attract relevant search and collector traffic;
- on-site affiliate decisions using approved paths;
- owned-media video concepts that answer demonstrated collector demand.

It does not propose cold outreach. The strategy is to make BlindBoxAI more useful and discoverable so collectors, buyers, and potential partners come to the site.

Because this repository is public, plaintext findings are never written to disk or uploaded. The runner:

1. holds the structured result in memory;
2. applies deterministic evidence, currency, freshness, risk, and approval gates;
3. encrypts the complete JSON result with AES-256-GCM;
4. writes and uploads only `*.json.enc` for 14 days;
5. logs no brand, series, source, opportunity, score, or candidate count.

The key in `MR_RESEARCH_ENCRYPTION_KEY` must be a separate, canonical base64-encoded 32-byte secret. The public Q&A and workflow fail closed unless the required OpenAI, private Blob, and encryption secrets are present.

Create a dedicated **private** Vercel Blob store for question demand. Put its read-write token in `MR_PRIVATE_BLOB_READ_WRITE_TOKEN` in both Vercel and GitHub Actions. Do not point this variable at the public evidence-upload store.

Generate an owner key in a trusted local terminal and save it immediately in a password manager:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store the same value in all three places:

- repository Actions secret: `MR_RESEARCH_ENCRYPTION_KEY`;
- Vercel server environment: `MR_RESEARCH_ENCRYPTION_KEY`;
- the owner's untracked `.env.local`: `MR_RESEARCH_ENCRYPTION_KEY=...`.

Download an encrypted workflow artifact into the project, then decrypt it locally:

```bash
npm run mr:decrypt -- --input output/mr-know-it-all/private-research-....json.enc
```

Decrypted JSON is printed only in the owner's terminal. Do not paste it into a public issue, pull request, workflow log, or tracked file.

## Opportunity gate

Every candidate receives one deterministic status:

| Status | Meaning |
|---|---|
| `READY_FOR_OWNER_REVIEW` | Low-risk review candidate with at least two matching private questions, an official source, recent transaction source, at least three distinct fresh sources, at least three positive-USD observations, and an identified inbound monetization path. |
| `RESEARCH_ONLY` | Potentially useful but evidence, sample size, or risk is not strong enough for owner action. |
| `REJECTED` | Missing required proof, missing program evidence, stale evidence, unsafe claims, or another hard blocker. |

`READY_FOR_OWNER_REVIEW` is not approval and does not mean profitable or risk-free. The output always records `humanApprovalRequired: true`, `profitGuaranteed: false`, and `riskFree: false`.

## Configuration

Server-only values must never use a `NEXT_PUBLIC_` prefix.

| Name | Location | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Vercel secret and GitHub Actions secret | Authenticates Q&A and scheduled research. |
| `OPENAI_QA_MODEL` | Vercel environment | Defaults to cost-sensitive `gpt-5.6-luna`. |
| `OPENAI_RESEARCH_MODEL` | GitHub Actions variable | Defaults to balanced `gpt-5.6-terra`. |
| `MR_KNOW_IT_ALL_ENABLED` | Vercel environment | Must equal `true` to expose the Q&A endpoint. |
| `MR_PRIVATE_BLOB_READ_WRITE_TOKEN` | Vercel environment and GitHub Actions secret | A dedicated private-store token for already-encrypted question events; do not reuse a public evidence store. |
| `MR_RESEARCH_ENCRYPTION_KEY` | Vercel environment, GitHub Actions secret, and owner `.env.local` | Encrypts question events and research; decrypts owner reports. |
| `MR_KNOW_IT_ALL_OUTPUT_DIR` | Workflow/local environment | Defaults to ignored `output/mr-know-it-all`. |

Required production setup is intentionally split: a code merge cannot expose the Q&A or run scheduled research successfully until the owner adds the Vercel and GitHub secrets.
