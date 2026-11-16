# BlindBoxAI — instructions for GitHub Copilot

This file is a short entry point, **not** a replacement for [AGENTS.md](../AGENTS.md). AGENTS.md is the sole authority for the evidence hierarchy, state vocabulary, approval boundaries, and protected actions.

## Before changing any code

1. Read `AGENTS.md`, `docs/CURRENT_STATE.md`, and `docs/CONTEXT_TRANSFER.md` in that order.
2. Compare relevant open PRs with current `main`. A file on a draft branch is **not** a live feature. Avoid parallel changes that duplicate another PR.
3. Trace the complete actual execution path before editing a payment, authentication, publication, deletion, or other protected action. Run a disposable end-to-end test first.
4. Use short, independent changes with an exact file diff and test evidence. Keep unresolved or unproven findings `UNVERIFIED`.

## Owner authority and security

- **Never merge, deploy, schedule/publish content, send outreach, spend money, delete branches/records, or modify credentials without explicit owner authorization.** A successful CI run is not that authorization.
- Preserve Yellow upload/review and Blue exact-video owner approval, including explicit YouTube audience choice, for the canonical YouTube/TikTok video path. Do not silently add X or LinkedIn as canonical targets.
- The repository is public: never commit or echo secrets, tokens, private raw conversation records, private owner photos, or other unpublished originals. Never use real environment values as fixtures.
- For owner-supplied collectible examples, use redacted or synthetic example identifiers in public UI and tests. Obtain separate permission before publishing real photos.

## Money and evidence first

- The business goal is verified collector intent and **provider-confirmed affiliate conversions**, not click counts, mock transactions, guesses, or inflated traffic.
- Never use `GET` to test a live affiliate redirect (`/api/out/ebay`) or fetch outbound affiliate targets. For read-only QA, use `HEAD /api/out/ebay` with redirects disabled, inspect routes read-only, use local test fixtures, and verify against official EPN receipts when authorized.
- Only label an actual provider transaction/commission as verified revenue. A click count, successful deploy, Buffer ID, or HTTP 200 is not a conversion or proof a YouTube video played.
- For coins and paper money, preserve uncertain date/mint marks, grade, authenticity, postmark, and photo pairing as unresolved. Do not invent sold prices or fabricate precise grades. For current valuations require dated, exact-match completed-sale evidence and disclose fees and uncertainty.
- For reseller content, optimize for a useful page and qualifying intent, but keep a credible traffic and monetization path. Never fabricate comparisons, comparable sales, statistics, quotes, or sales claims; label missing evidence UNVERIFIED.

## Specific active work

- Coin research, currency research, and review-only local checklists: `research/coins/`, `research/currency/`, draft PR #307. Original photos are not in this repository. Do not count duplicate coins or pretend the 1879 Morgan's disputed O mark is confirmed.
- Existing engineering reconciliation work: issues #290 and #304. Avoid creating another near-duplicate coordination issue; add evidence to the relevant existing issue.
- Public-video receipts, analytics consent, EPN attribution, and owner-gated publication are distinct verification tracks. Never change publication statuses without exact supporting evidence.

## Validation and handoff

- Run focused tests first; examples: `npm run price:test`, `npm run owner:test`, `npm run release:test`, and `npm run docs:state-check` for protected topology changes. Then check the full release gate as appropriate.
- For PR handoffs, give the exact branch, commit SHA, diff, test command and complete output, CI run URL, unresolved blockers, and precise owner action. A PR may be `PR OPEN` while CI, merge, production, playback, and revenue remain unverified.
- Request an independent review for protected paths. Keep Copilot output as draft work until it passes verification and the owner explicitly approves the protected action.
