# Context Transfer

**Documentation status: CANONICAL HANDOFF PROTOCOL**

Use this whenever work moves to another AI agent, another conversation, or a future resumed session.

A Context Transfer is an orientation package. It does **not** replace raw evidence required by `AGENTS.md`.

## Required output

Return one self-contained text block containing:

### 1. Goal / current task
- What is being accomplished.
- Business or monetization purpose where relevant.
- Current priority.

### 2. Decisions already made
- Important decisions and why.
- Constraints that must not be changed.
- Rejected approaches and why.

### 3. Verified current state
Classify work using the exact state vocabulary defined in [`AGENTS.md`](../AGENTS.md). Do not restate or redefine it here.

Never claim a later state without evidence.

### 4. Progress
- Finished
- In progress
- Blocked
- Not started

### 5. Technical context
Include every important repository, branch, PR, commit, workflow/action, deployment, domain/URL, API endpoint, database/table/function, file/path, service/provider, account/channel, relevant ID, and command already executed.

### 6. Important evidence
Preserve exact error messages, test results, logs, counts, timestamps, and other facts needed to diagnose or continue the work.

### 7. Security / governance
- Never include secret values, passwords, tokens, cookies, or raw environment-variable values.
- Refer to secrets only by variable name.
- Preserve owner approval requirements.
- Identify destructive, publishing, credential, spending, production, or irreversible actions that still require approval.

### 8. Open problems
For each unresolved issue include:
- symptom;
- verified cause, if known;
- hypotheses, clearly labeled;
- what has already been tried;
- what still needs verification.

### 9. Exact place we stopped
Describe the final completed action and its result.

### 10. Next action
Give the single highest-priority next action first, then subsequent actions in dependency order. Include copy-paste commands where appropriate.

### 11. Do-not-repeat
List completed tests, failed approaches, superseded decisions, and actions another agent should not redo.

### 12. Confidence
Mark uncertain information as `HIGH`, `MEDIUM`, or `LOW` confidence.

## Rules

- Separate verified facts from assumptions.
- Never invent missing information.
- Preserve exact identifiers.
- Prefer the latest verified state over older history.
- Mark contradicted older information as **SUPERSEDED**.
- Remove chatter and repetition but preserve execution-critical detail.
- Assume the receiving agent has zero access to the original conversation.
- Before acting on a transferred claim, verify it against the repository or observable system when it affects a protected path.
