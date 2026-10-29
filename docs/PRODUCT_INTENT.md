# BlindBoxAI Product Intent

## Purpose

BlindBoxAI is a collectible-research and affiliate-content codebase. The repository contains the web application, research tooling, owner-gated content workflows, attribution logic, and supporting specialist systems for review, publishing, and operational handoff.

This document captures the product intent for the current repo state and should be read alongside:

- `AGENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/CONTEXT_TRANSFER.md`

## Product summary

BlindBoxAI combines:

- collectible research workflows
- content review and approval gates
- affiliate publishing support
- owner-controlled distribution decisions
- production evidence and deployment traceability

The product intent is not just a landing page or a marketing concept; it is an operational system that must remain consistent with current workflow definitions and live deployment behavior.

## Current repository scope

From the current repo topology and documentation:

- the main application is a web app with owner-gated review and publishing flows
- there are specialist video and social automation paths
- the canonical owner-reviewed queue path is the reviewed-video publisher workflow
- publication actions are tightly gated by owner authorization and exact workflow selection
- documentation exists to support architecture review, handoff, and buyer diligence

## Primary workflows

### Canonical owner-reviewed video publishing

The current canonical path is the queue-based video publisher described in `docs/CURRENT_STATE.md`.

Key characteristics:

- workflow trigger is `workflow_dispatch` only
- default mode is `dry_run: true`
- production channels are pinned to `youtube,tiktok`
- X/Twitter is parked for the canonical review-queue publisher
- runs require exact selectors such as `publish_channel` and `research_run_id`
- the workflow calls `scripts/publish-approved-review-queue.mjs`
- owner approval and exact output validation are required before publishing

### Manual reviewed upload path

`/.github/workflows/manual-reviewed-video.yml` validates a single uploaded MP4 and then publishes the exact owner-reviewed upload.

### Specialist social and affiliate paths

The repo includes additional specialist paths for social/affiliate workflows, but they are not replacements for the canonical review-queue publisher and must not be treated as the active production target unless their workflow is specifically enabled and configured for that purpose.

## Product intent and operating principle

BlindBoxAI is intended to be:

- traceable
- owner-controlled
- evidence-driven
- operationally explicit about what is active versus historical
- review-first before publication

The repo follows a governance model where current production behavior wins over older documents, branch status, or narrative assumptions. This is reflected in the canonical documentation hierarchy:

1. `AGENTS.md` — evidence hierarchy and protected actions
2. `docs/CURRENT_STATE.md` — topology and active workflow map
3. `docs/CONTEXT_TRANSFER.md` — handoff format for agents and threads

## PR intent statement

This PR establishes the product intent and operational overview for BlindBoxAI as a documented, owner-governed, review-first publishing and research system.

The goal is to make the repo explainable to humans and agents by documenting:

- the product purpose
- the active workflow topology
- the canonical publishing path
- the distinction between active and historical/subsystem-specific flows
- the evidence-based governance model used by the project

## Current-state summary

BlindBoxAI is an intentionally structured codebase with strong operational boundaries and explicit workflow validation. It is not a generic app scaffold; it is a review-driven platform that has separate production, specialist, and documentation layers, each requiring clear ownership and evidence before claiming deployment or publication.

## Related files

- `README.md`
- `AGENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/CONTEXT_TRANSFER.md`
- `.github/workflows/publish-approved-reviews.yml`
- `.github/workflows/manual-reviewed-video.yml`
