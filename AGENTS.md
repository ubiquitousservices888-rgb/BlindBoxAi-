# AGENTS.md — Multi-AI Working Protocol

## The rule everything else depends on

**Evidence travels between AIs as complete raw output, never as another AI's prose summary.**

A summary of a command is not evidence. Paste the command and its complete, unedited output.

## State vocabulary

CODED → COMMITTED → PUSHED → PR OPEN → CI PASSED → MERGED → DEPLOYED → LIVE VERIFIED

"Working", "done", and "shipped" are not states.

## Every claim ships with evidence

- Code changed: commit SHA plus git diff --stat output
- Pushed: branch name plus push output
- Merged: merge commit SHA plus the command confirming it on main
- Deployed: deployment ID plus HTTP status from a live fetch
- Behaviour works: command run plus complete unedited output
- Something absent: the grep or find run plus its empty result

No evidence means report it as UNVERIFIED. That is an acceptable answer and is preferred over an unsupported claim.

## Familiarization and documentation authority

Before writing to a resumed or unfamiliar project:

1. Read `docs/CURRENT_STATE.md`.
2. Inspect current `main` and relevant open PRs.
3. Trace the actual execution path for any protected action.
4. Mark unsupported claims `UNVERIFIED`.
5. Identify and flag superseded documentation before changing architecture.

When sources disagree, observable production behavior and raw evidence outrank `main`; `main` outranks documentation; documentation outranks historical branches and summaries.

Use `docs/CONTEXT_TRANSFER.md` for every substantial agent/thread handoff. A Context Transfer is orientation, not evidence.

Run `npm run docs:state-check` after changing protected workflow topology or pipeline documentation.

## Protected paths

Protected actions: public publishing, payments, authentication, deletion, anything reaching an external account.

Before changing a protected path:

1. Trace every execution path that can reach the protected action
2. Run a disposable end-to-end test FIRST
3. Only then change the architecture

Architecture changed ahead of a test is a hypothesis, not a fix. An audit suggesting a better design does not waive the test.

## Prohibited

- Reporting a merge as a deployment
- Claiming a feature exists because an env var, document, or earlier plan references it. Verify in the code.
- Creating any path around an owner approval gate
- Printing secret VALUES. Names only, always.
- Contradicting a previously recorded decision without flagging the conflict explicitly

## Disagreement between AIs

Do not defend a position. Run the command that settles it and paste the output. Two AIs agreeing is not evidence. Output is evidence.

## Roles

Write access belongs to whichever agent the owner has authorised. The reviewing agent reads raw evidence and separates verified findings from hypotheses. Neither agent is a source of truth. The repository and observable production behaviour are.

## Mandatory pre-push code quality gate (all AI coding work)

This rule applies to every code change, including fixes suggested by another AI. A second AI review is not a substitute for verification.

1. **Lock the scope.** Record the repository, exact PR/branch, current head SHA, permitted files, and approval limits. Recheck the head before writing. If it moved unexpectedly, stop instead of overwriting another change.
2. **Read the complete target.** Inspect the actual file, its callers, relevant tests and the CI job that will exercise it. Do not patch from partial screenshots or assumptions.
3. **Prepare a minimal, exact edit.** Use an exact patch or carefully checked full-file replacement. Preserve all unrelated lines. When editing through code generation, guard against string interpolation, quoting, backslashes, regular expressions and replacement characters such as $ and &. Never trust a generated patch without inspecting its final text.
4. **Check before pushing.** On the *final edited bytes*, run the language's syntax/compile check and targeted tests when applicable (for JavaScript, use Node's syntax check where supported). Run negative/positive regression cases for guards and approval boundaries: prove a forbidden change fails and an allowed change passes. Check whitespace and inspect the full diff and changed-file list.
5. **Fail closed on missing evidence.** If the environment cannot execute a required check, label that check UNVERIFIED and arrange a check before claiming readiness. Do not describe a readback, a review, or a previous commit's green checks as a test of the new code. Do not silently push unverified code as though it passed.
6. **Push safely and read back.** Verify only permitted files changed, confirm the exact commit and branch after pushing, and re-read the modified file to catch formatting or escaping damage. Never force-push or merge merely to finish the task.
7. **Wait for the matching release gate.** Report the results for the **new head SHA**, not an earlier SHA: Preflight, Test, Build, Audit, and any conditional production smoke. Diagnose a failure from job logs, fix the root cause, and repeat checks before calling the PR ready. A passing PR check does not prove deployment or revenue.
8. **Respect owner control.** Merge, deploy, live publish, external-account writes, payment changes, and anything affecting Blue owner approval remain subject to their separate authorization and existing gates.

Every PR handoff should include: exact changed paths, commit SHA, raw verification commands/results or an explicit UNVERIFIED label, known remaining risks, CI run URL, and a precise statement of whether it was merged or deployed.

**Stop condition:** Never mark a coding task COMPLETE if final-source verification or required CI failed, is running, or was skipped without a stated reason.

