# AGENTS.md — Multi-AI Working Protocol

## The rule everything else depends on

**Evidence travels between AIs as complete raw output, never as another AI's prose summary.**

A summary of a command is not evidence. Paste the command and its complete, unedited output.

## State vocabulary

CODED, COMMITTED, PUSHED, PR OPEN, CI PASSED, MERGED, DEPLOYED, LIVE VERIFIED

"Working", "done", and "shipped" are not states.

## Every claim ships with evidence

- Code changed: commit SHA plus git diff --stat output
- Pushed: branch name plus push output
- Merged: merge commit SHA plus the command confirming it on main
- Deployed: deployment ID plus HTTP status from a live fetch
- Behaviour works: command run plus complete unedited output
- Something absent: the grep or find run plus its empty result

No evidence means report it as UNVERIFIED. That is an acceptable answer and is preferred over an unsupported claim.

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
