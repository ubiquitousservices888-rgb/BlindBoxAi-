const API_ROOT = "https://api.github.com";
const DEFAULT_OWNER = "ubiquitousservices888-rgb";
const DEFAULT_REPO = "BlindBoxAi-";
const VIDEO_WORKFLOW = "autonomous-video.yml";
const APPROVAL_ENVIRONMENT = "social-production";
const API_VERSION = "2022-11-28";

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

async function githubJson(path, { token, fetchImpl = fetch, method = "GET", body } = {}) {
  const secret = required(token, "GITHUB_OWNER_APPROVAL_TOKEN");
  const response = await fetchImpl(`${API_ROOT}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${secret}`,
      "X-GitHub-Api-Version": API_VERSION,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const error = new Error(`GitHub owner approval request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function uniqueRuns(runs) {
  return [...new Map(runs.map((run) => [run.id, run])).values()];
}

export async function findLaunchReadyVideoRuns({
  token,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  fetchImpl = fetch,
} = {}) {
  const safeOwner = encodeURIComponent(required(owner, "owner"));
  const safeRepo = encodeURIComponent(required(repo, "repo"));
  const statuses = ["waiting", "in_progress"];
  const discovered = [];

  for (const status of statuses) {
    const data = await githubJson(
      `/repos/${safeOwner}/${safeRepo}/actions/workflows/${VIDEO_WORKFLOW}/runs?branch=main&status=${status}&per_page=50`,
      { token, fetchImpl },
    );
    discovered.push(...(Array.isArray(data?.workflow_runs) ? data.workflow_runs : []));
  }

  const ready = [];
  const skipped = [];
  for (const run of uniqueRuns(discovered)) {
    if (run?.head_branch !== "main") continue;
    const pending = await githubJson(
      `/repos/${safeOwner}/${safeRepo}/actions/runs/${run.id}/pending_deployments`,
      { token, fetchImpl },
    );
    const environments = (Array.isArray(pending) ? pending : []).filter(
      (item) => item?.environment?.name === APPROVAL_ENVIRONMENT,
    );
    if (!environments.length) continue;

    const approvable = environments.filter((item) => item.current_user_can_approve === true);
    if (!approvable.length) {
      skipped.push({
        runId: run.id,
        reason: "approval_not_permitted_for_token_user",
      });
      continue;
    }

    ready.push({
      runId: run.id,
      htmlUrl: run.html_url ?? null,
      createdAt: run.created_at ?? null,
      environmentIds: approvable.map((item) => item.environment.id),
      environmentNames: approvable.map((item) => item.environment.name),
    });
  }

  return { ready, skipped };
}

export async function approveAllLaunchReadyVideos({
  token,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  fetchImpl = fetch,
} = {}) {
  const safeOwner = encodeURIComponent(required(owner, "owner"));
  const safeRepo = encodeURIComponent(required(repo, "repo"));
  const { ready, skipped } = await findLaunchReadyVideoRuns({ token, owner, repo, fetchImpl });
  const approved = [];

  for (const run of ready) {
    await githubJson(
      `/repos/${safeOwner}/${safeRepo}/actions/runs/${run.runId}/pending_deployments`,
      {
        token,
        fetchImpl,
        method: "POST",
        body: {
          environment_ids: run.environmentIds,
          state: "approved",
          comment: "Approved from BlindBoxAI Owner Dashboard — launch all already-validated video jobs.",
        },
      },
    );
    approved.push({
      runId: run.runId,
      htmlUrl: run.htmlUrl,
      environments: run.environmentNames,
    });
  }

  return {
    status: approved.length ? "approved" : "nothing_ready",
    approvedRuns: approved.length,
    approvedEnvironments: approved.reduce((sum, item) => sum + item.environments.length, 0),
    approved,
    skipped,
    scope: "autonomous-video.yml:main:social-production",
  };
}
