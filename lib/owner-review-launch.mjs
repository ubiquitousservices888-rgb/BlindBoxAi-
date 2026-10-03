const API_ROOT = "https://api.github.com";
const DEFAULT_OWNER = "ubiquitousservices888-rgb";
const DEFAULT_REPO = "BlindBoxAi-";
const REVIEW_PUBLISH_WORKFLOW = "publish-approved-reviews.yml";
const APPROVAL_ENVIRONMENT = "social-production";
const API_VERSION = "2026-03-10";
const PUBLISH_CHANNELS = Object.freeze(["youtube", "tiktok"]);
const PENDING_DEPLOYMENT_ATTEMPTS = 12;
const PENDING_DEPLOYMENT_DELAY_MS = 500;

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
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

async function dispatchWorkflow({
  owner,
  repo,
  token,
  channel,
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
          publish_channel: channel,
          research_run_id: researchRunId,
          youtube_audience: youtubeAudience,
        },
      },
    },
  );

  const workflowRunId = Number(payload?.workflow_run_id);
  if (!Number.isSafeInteger(workflowRunId) || workflowRunId <= 0) {
    const error = new Error(`GitHub did not return a workflow run ID for ${channel}`);
    error.status = 502;
    throw error;
  }

  return {
    channel,
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
        const error = new Error("Owner token cannot approve the social-production deployment gate");
        error.status = 403;
        throw error;
      }
      return approvable;
    }
    if (attempt < PENDING_DEPLOYMENT_ATTEMPTS) await delayImpl(PENDING_DEPLOYMENT_DELAY_MS);
  }
  const error = new Error("Published-video workflow did not reach the social-production gate");
  error.status = 409;
  throw error;
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
  await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${run.runId}/pending_deployments`,
    {
      token,
      fetchImpl,
      method: "POST",
      body: {
        environment_ids: pending.map((item) => item.environment.id),
        state: "approved",
        comment: `Approved by BlindBoxAI Blue owner launch for ${run.channel}.`,
      },
    },
  );
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

  const dispatched = await Promise.all(
    PUBLISH_CHANNELS.map((channel) => dispatchWorkflow({
      owner,
      repo,
      token,
      channel,
      researchRunId: runId,
      youtubeAudience: audience,
      fetchImpl,
    })),
  );
  const approved = await Promise.all(
    dispatched.map((run) => approveRunEnvironment({
      owner,
      repo,
      token,
      run,
      fetchImpl,
      delayImpl,
    })),
  );

  return {
    status: "dispatched_and_environment_approved",
    workflow: REVIEW_PUBLISH_WORKFLOW,
    researchRunId: runId,
    channels: approved.map((run) => run.channel),
    youtubeAudience: audience,
    runs: approved,
  };
}
