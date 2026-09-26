# BlindBoxAI

BlindBoxAI is a collectible-research and affiliate-content codebase. This repository contains the web app, research tooling, owner-gated content workflows, attribution code, and supporting specialist pipelines.

## Start here

Before changing anything, read these in order:

1. [`AGENTS.md`](./AGENTS.md) — the single canonical source for evidence hierarchy, state vocabulary, approval boundaries, and protected-action rules.
2. [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md) — the current topology map and subsystem status.
3. [`docs/CONTEXT_TRANSFER.md`](./docs/CONTEXT_TRANSFER.md) — the required handoff format when work moves between agents or threads.

Do not redefine the governance vocabulary or authority order in secondary documents; link back to `AGENTS.md`.

A branch existing in GitHub does **not** mean its architecture is active. A document describing a workflow does **not** prove that workflow is deployed.

This is a public repository. Never commit or print secret values, tokens, cookies, passwords, or private environment-variable contents.
