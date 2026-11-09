const API_ROOT = "https://api.github.com";
const DEFAULT_OWNER = "ubiquitousservices888-rgb";
const DEFAULT_REPO = "BlindBoxAi-";
const REVIEW_PUBLISH_WORKFLOW = "publish-approved-reviews.yml";
const APPROVAL_ENVIRONMENT = "social-production";
const API_VERSION = "2026-03-10";
const PUBLISH_CHANNELS = Object.freeze(["youtube", "tiktok"]);
// The run normally reaches the gate within a few seconds; allow ~20s so a
// slow GitHub queue does not leave an unapproved run behind.
const PENDING_DEPLOYMENT_ATTEMPTS = 20;
const PENDING_DEPLOYMENT_DELAY_MS = 1000;

// Plain-language reasons shown to the owner when publishing could not start.
export const LAUNCH_FAILURE_MESSAGES = Object.freeze({
  approval_not_permitted:
    "GitHub started the publishing run but would not let the dashboard's GitHub key approve it. The key needs permission to approve deployments (for a fine-grained token: Deployments, read and write).",
  approver_not_allowed:
    "The GitHub account behind the dashboard's key is not an allowed approver for social-production.",
  gate_not_reached:
    "GitHub did not get the publishing run to its approval step in time.",
  approval_failed:
    "GitHub refused the approval for the publishing run.",
});

export class ReviewLaunchError extends Error {
  constructor(code, { status, runId = null, htmlUrl = null, runCancelled = false, diagnostic = "" } = {}) {
    super(`${LAUNCH_FAILURE_MESSAGES[code] || "Publishing could not start."}${diagnostic ? ` (GitHub: ${diagnostic})` : ""}`);
    this.name = "ReviewLaunchError";
    this.code = code;
    this.status = status;
    this.runId = runId;
    this.htmlUrl = htmlUrl;
    this.runCancelled = runCancelled;
    this.ownerMessage = LAUNCH_FAILURE_MESSAGES[code] || "Publishing could not start.";
  }
}

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function validRunId(value) {
  const runId = required(value, "researchRunId");
  if (!/^rv-[a-f0-9]{16}$/.test(runId)) throw new Error("researchRunId is invalid");
  return runId;
}

function validYoutubeAudience(value) {
  const audience = required(value, "youtubeAudience");
  if (!["made_for_kids", "not_made_for_kids"].includes(audience)) {
    throw new Error("youtubeAudience must be made_for_kids or not_made_for_kids");
  }
  return audience;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubRequest(path, {
  token,
  fetchImpl = fetch,
  method = "GET",
  body,
} = {}) {
  const response = await fetchImpl(`${API_ROOT}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${required(token, "GITHUB_OWNER_APPROVAL_TOKEN")}`,
      "X-GitHub-Api-Version": API_VERSION,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const diagnostic = String(payload?.message || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 240);
    const error = new Error(
      `GitHub owner launch request failed with HTTP ${response.status}${diagnostic ? `: ${diagnostic}` : ""}`,
    );
    error.status = response.status;
    error.diagnostic = diagnostic;
    throw error;
  }

  if (response.status === 204 || response.status === 202) return null;
  return response.json();
}

async function dispatchWorkflow({
  owner,
  repo,
  token,
  researchRunId,
  youtubeAudience,
  fetchImpl,
}) {
  const payload = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${REVIEW_PUBLISH_WORKFLOW}/dispatches`,
    {
      token,
      fetchImpl,
      method: "POST",
      body: {
        ref: "main",
        return_run_details: true,
        inputs: {
          dry_run: false,
          publish_channel: "all",
          research_run_id: researchRunId,
          youtube_audience: youtubeAudience,
        },
      },
    },
  );

  const workflowRunId = Number(payload?.workflow_run_id);
  if (!Number.isSafeInteger(workflowRunId) || workflowRunId <= 0) {
    const error = new Error("GitHub did not return a workflow run ID for reviewed publishing");
    error.status = 502;
    throw error;
  }

  return {
    runId: workflowRunId,
    htmlUrl: typeof payload?.html_url === "string" ? payload.html_url : null,
  };
}

async function waitForPendingDeployment({
  owner,
  repo,
  token,
  runId,
  fetchImpl,
  delayImpl,
}) {
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repo);
  for (let attempt = 1; attempt <= PENDING_DEPLOYMENT_ATTEMPTS; attempt += 1) {
    const pending = await githubRequest(
      `/repos/${safeOwner}/${safeRepo}/actions/runs/${runId}/pending_deployments`,
      { token, fetchImpl },
    );
    const matches = (Array.isArray(pending) ? pending : []).filter(
      (item) => item?.environment?.name === APPROVAL_ENVIRONMENT,
    );
    if (matches.length) {
      const approvable = matches.filter((item) => item.current_user_can_approve === true);
      if (!approvable.length) {
        throw new ReviewLaunchError("approver_not_allowed", { status: 403, runId });
      }
      return approvable;
    }
    if (attempt < PENDING_DEPLOYMENT_ATTEMPTS) await delayImpl(PENDING_DEPLOYMENT_DELAY_MS);
  }
  throw new ReviewLaunchError("gate_not_reached", { status: 409, runId });
}

// Best effort: a run the dashboard could not approve is cancelled so that a
// retry starts clean instead of piling up runs that wait forever at the gate.
async function cancelRun({ owner, repo, token, runId, fetchImpl }) {
  try {
    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/cancel`,
      { token, fetchImpl, method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
}

async function approveRunEnvironment({
  owner,
  repo,
  token,
  run,
  fetchImpl,
  delayImpl,
}) {
  const pending = await waitForPendingDeployment({
    owner,
    repo,
    token,
    runId: run.runId,
    fetchImpl,
    delayImpl,
  });
  try {
    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${run.runId}/pending_deployments`,
      {
        token,
        fetchImpl,
        method: "POST",
        body: {
          environment_ids: pending.map((item) => item.environment.id),
          state: "approved",
          comment: "Approved by BlindBoxAI Blue owner launch for serialized YouTube + TikTok publishing.",
        },
      },
    );
  } catch (cause) {
    const code = cause?.status === 403 || cause?.status === 404 ? "approval_not_permitted" : "approval_failed";
    throw new ReviewLaunchError(code, { status: cause?.status, runId: run.runId, diagnostic: cause?.diagnostic || "" });
  }
  return { ...run, environment: APPROVAL_ENVIRONMENT, environmentApproved: true };
}

export async function dispatchApprovedReviewPublication({
  token,
  researchRunId,
  youtubeAudience,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  fetchImpl = fetch,
  delayImpl = delay,
} = {}) {
  const runId = validRunId(researchRunId);
  const audience = validYoutubeAudience(youtubeAudience);
  required(owner, "owner");
  required(repo, "repo");

  const dispatched = await dispatchWorkflow({
    owner,
    repo,
    token,
    researchRunId: runId,
    youtubeAudience: audience,
    fetchImpl,
  });
  let approved;
  try {
    approved = await approveRunEnvironment({
      owner,
      repo,
      token,
      run: dispatched,
      fetchImpl,
      delayImpl,
    });
  } catch (cause) {
    const runCancelled = await cancelRun({ owner, repo, token, runId: dispatched.runId, fetchImpl });
    if (cause instanceof ReviewLaunchError) {
      cause.runCancelled = runCancelled;
      cause.htmlUrl = dispatched.htmlUrl;
      throw cause;
    }
    throw new ReviewLaunchError("approval_failed", {
      status: cause?.status,
      runId: dispatched.runId,
      htmlUrl: dispatched.htmlUrl,
      runCancelled,
      diagnostic: cause?.diagnostic || "",
    });
  }

  return {
    status: "dispatched_and_environment_approved",
    workflow: REVIEW_PUBLISH_WORKFLOW,
    researchRunId: runId,
    channels: [...PUBLISH_CHANNELS],
    youtubeAudience: audience,
    run: approved,
  };
}
