# BlindBoxAI

BlindBoxAI is a collectible-research and affiliate-content codebase. This repository contains the web app, research tooling, owner-gated content workflows, attribution code, and supporting specialist pipelines.

## Start here

Before changing anything, read these in order:

1. [`AGENTS.md`](./AGENTS.md) — evidence, governance, approval boundaries, and state vocabulary.
2. [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md) — canonical map of which pipelines are current and which documents are specialist or historical.
3. [`docs/CONTEXT_TRANSFER.md`](./docs/CONTEXT_TRANSFER.md) — required handoff format when work moves between agents or threads.

## Authority order

When two sources disagree, use this order:

1. observable production behavior and complete raw evidence;
2. code and workflows on `main`;
3. `docs/CURRENT_STATE.md`;
4. subsystem documentation;
5. old branches, closed PRs, old artifacts, and conversation summaries.

A branch existing in GitHub does **not** mean its architecture is active. A document describing a workflow does **not** prove that workflow is deployed.

## Safe operating rule

Use the repository state vocabulary exactly:

`CODED → COMMITTED → PUSHED → PR OPEN → CI PASSED → MERGED → DEPLOYED → LIVE VERIFIED`

Never promote a change to a later state without evidence.

This is a public repository. Never commit or print secret values, tokens, cookies, passwords, or private environment-variable contents.
