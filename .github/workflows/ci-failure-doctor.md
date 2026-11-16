# CI failure doctor — non-runnable design note

**Documentation status: LEGACY / REFERENCE.** This file contains no agentic
workflow frontmatter, tool grants or executable configuration. It is not input
to `gh aw compile` and must not be activated by adding a lock file.

The implemented free diagnostic is `ci-failure-investigation.yml`, which calls
`scripts/ci-failure-investigator.mjs`. It validates the selected source run's
repository, exact release-gate workflow path, completed state, commit SHA and
failure conclusion before reading bounded job/step metadata. The diagnostic
does not use a model and never reads raw Actions logs.

Any future AI implementation requires a separate reviewed PR and an explicit
owner-approved inference provider and spending limit. Before granting any
tools, a deterministic boundary must validate the exact owner-selected run ID
and prepare only bounded, approved job/step metadata. An agent must never
receive raw logs, production secrets, arbitrary run lookup tools or write access.
Issue creation, comments, workflow dispatch, deployment, media publication,
failure-reporting outputs and all other write outputs must be disabled in the
actual executable configuration and verified with disposable negative tests.

Prompt instructions alone do not enforce these restrictions. This design note
does not establish an active AI agent, a verified diagnosis, a live deployment,
public video playback or affiliate conversions. Owner approval, payment and
publication gates remain unchanged.
