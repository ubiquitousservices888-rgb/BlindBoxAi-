#!/usr/bin/env python3
"""Owner-approved issue -> code-only proposal, with an independent diff safety check.

No GitHub write token is provided while the OpenHands SDK is running.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

PROTECTED_PREFIXES = (
    ".github/", "supabase/", "app/api/", "scripts/publish-",
    "scripts/owner-", "lib/owner-", "lib/affiliate-",
    "lib/ebay-", "lib/stripe-", "tests/fixtures/secrets",
)
PROTECTED_FILES = {"AGENTS.md", "package.json", "package-lock.json", ".gitignore", "scripts/openhands-issue-resolver.py", "scripts/predeploy.sh"}
MAX_FILES = 12
MAX_CHANGED_LINES = 1200


def run_git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args])


def validate_diff() -> None:
    # Intent-to-add makes new files visible to git diff without committing them.
    subprocess.run(["git", "add", "-N", "--", "."], check=True, stdout=subprocess.DEVNULL)
    raw = run_git("diff", "--name-only", "-z")
    paths = [b.decode("utf-8") for b in raw.split(b"\x00") if b]
    if not paths or len(paths) > MAX_FILES:
        raise ValueError("No proposed changes, or file-count budget exceeded")
    for path in paths:
        p = path.replace("\\", "/")
        if (
            p in PROTECTED_FILES or p.startswith(PROTECTED_PREFIXES)
            or "/.env" in "/" + p or p.endswith((".pem", ".key", ".p12", ".mp4", ".lock"))
            or p.startswith(".") or ".." in Path(p).parts
        ):
            raise ValueError("Protected or unsupported path in proposal: " + p)
    changed = 0
    for row in run_git("diff", "--numstat", "-z").split(b"\x00"):
        if not row:
            continue
        cols = row.split(b"\t")
        if len(cols) != 3 or not cols[0].isdigit() or not cols[1].isdigit():
            raise ValueError("Binary or malformed diff was rejected")
        changed += int(cols[0]) + int(cols[1])
    if changed > MAX_CHANGED_LINES:
        raise ValueError("Changed-line budget exceeded")
    print("DIFF_GUARD_PASS: proposal only; protected paths and size budgets passed")


def run_agent() -> None:
    model = os.environ.get("LLM_MODEL", "")
    key = os.environ.get("LLM_API_KEY", "")
    if model not in {"gemini/gemini-2.5-flash", "gemini/gemini-2.5-flash-lite"} or not key:
        raise ValueError("Gemini model or API-key configuration missing")
    limit = int(os.environ.get("OPENHANDS_MAX_ITER", "12"))
    if not 1 <= limit <= 12:
        raise ValueError("Iteration cap outside approved bound")
    issue = Path(os.environ["ISSUE_TEXT_FILE"]).read_text(encoding="utf-8")
    if not 15 <= len(issue.encode("utf-8")) <= 16000:
        raise ValueError("Issue exceeds input budget")
    # Lazy import keeps the standalone diff verifier executable without SDK installs.
    from openhands.sdk import Agent, Conversation, LLM, Tool
    from openhands.sdk.conversation.state import ConversationExecutionStatus
    from openhands.tools.file_editor import FileEditorTool
    from openhands.tools.task_tracker import TaskTrackerTool

    prompt = (
        "You are editing a disposable checkout of BlindBoxAI. Read AGENTS.md first. "
        "Make the smallest accurate change addressing exactly this owner-approved issue. "
        "You have only file-editing/task tools: do not install tools, use network, or run shell commands. "
        "Do not modify AGENTS.md, .github, Supabase, authentication, payments, publishing, "
        "affiliate routing, owner approvals, dependency manifests, secrets, or credentials. "
        "If the task requires protected changes, stop without modifying files. "
        "Never print secrets, fabricate tests, claim deployment, or broaden scope. "
        "The host will validate diffs and run isolated tests after you finish.\n\n"
        "APPROVED ISSUE:\n" + issue
    )
    agent = Agent(
        llm=LLM(model=model, api_key=key),
        tools=[Tool(name=FileEditorTool.name), Tool(name=TaskTrackerTool.name)],
    )
    conversation = Conversation(
        agent=agent,
        workspace=str(Path.cwd()),
        max_iteration_per_run=limit,
        persistence_dir=os.environ.get("RUNNER_TEMP", "/tmp") + "/openhands-state",
    )
    conversation.send_message(prompt)
    conversation.run()
    if conversation.state.execution_status != ConversationExecutionStatus.FINISHED:
        raise RuntimeError("Agent did not finish within the approved iteration budget")
    print("AGENT_FINISHED: output remains an unreviewed code proposal")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--validate-diff"]:
            validate_diff()
        elif len(sys.argv) == 1:
            run_agent()
        else:
            raise ValueError("Unsupported argument")
    except Exception as exc:
        # Never echo an exception message that might contain source or credential text.
        print("RESOLVER_STOPPED:", type(exc).__name__, file=sys.stderr)
        sys.exit(1)
