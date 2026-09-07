const API_ROOT = "https://api.github.com";
const DEFAULT_OWNER = "ubiquitousservices888-rgb";
const DEFAULT_REPO = "BlindBoxAi-";
const VIDEO_WORKFLOWS = ["autonomous-video.yml", "manual-reviewed-video.yml"];
const APPROVAL_ENVIRONMENT = "social-production";
const MANUAL_REVIEW_WORKFLOW = "manual-reviewed-video.yml";
const API_VERSION = "2022-11-28";

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function safeReviewVideoUrl(value) {
  const text = required(value, "videoUrl");
  let url;
  try { url = new URL(text); } catch { throw new Error("videoUrl must be a valid URL"); }
  if (url.protocol !== "https:") throw new Error("videoUrl must use HTTPS");
  if (!url.pathname.startsWith("/media/review/")) throw new Error("videoUrl must use the /media/review/ namespace");
  if (!/\.mp4$/i.test(url.pathname)) throw new Error("videoUrl must point to an MP4");
  return url.toString();
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

async function listWorkflowRuns({ safeOwner, safeRepo, workflow, status, token, fetchImpl }) {
  const runs = [];
  for (let page = 1; ; page += 1) {
    const data = await githubJson(
      `/repos/${safeOwner}/${safeRepo}/actions/workflows/${workflow}/runs?branch=main&status=${status}&per_page=100&page=${page}`,
      { token, fetchImpl },
    );
    const pageRuns = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
    runs.push(...pageRuns);
    if (pageRuns.length < 100) return runs;
  }
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

  for (const workflow of VIDEO_WORKFLOWS) {
    for (const status of statuses) {
      const runs = await listWorkflowRuns({
        safeOwner,
        safeRepo,
        workflow,
        status,
        token,
        fetchImpl,
      });
      for (const run of runs) discovered.push({ ...run, workflowFile: workflow });
    }
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
      skipped.push({ runId: run.id, workflowFile: run.workflowFile, reason: "approval_not_permitted_for_token_user" });
      continue;
    }

    ready.push({
      runId: run.id,
      workflowFile: run.workflowFile,
      htmlUrl: run.html_url ?? null,
      createdAt: run.created_at ?? null,
      environmentIds: approvable.map((item) => item.environment.id),
      environmentNames: approvable.map((item) => item.environment.name),
    });
  }

  return { ready, skipped };
}

export async function approveLaunchReadyVideo({
  token,
  videoUrl,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  fetchImpl = fetch,
} = {}) {
  const safeOwner = encodeURIComponent(required(owner, "owner"));
  const safeRepo = encodeURIComponent(required(repo, "repo"));
  const target = safeReviewVideoUrl(videoUrl);
  const runs = await listWorkflowRuns({
    safeOwner,
    safeRepo,
    workflow: MANUAL_REVIEW_WORKFLOW,
    status: "waiting",
    token,
    fetchImpl,
  });

  const matches = runs.filter((run) => {
    if (run?.head_branch !== "main") return false;
    const displayTitle = String(run?.display_title || run?.name || "");
    return displayTitle.includes(target);
  });

  if (matches.length === 0) {
    const activeRuns = await listWorkflowRuns({
      safeOwner,
      safeRepo,
      workflow: MANUAL_REVIEW_WORKFLOW,
      status: "in_progress",
      token,
      fetchImpl,
    });
    for (const run of activeRuns) {
      if (run?.head_branch !== "main") continue;
      const displayTitle = String(run?.display_title || run?.name || "");
      if (displayTitle.includes(target)) matches.push(run);
    }
  }

  if (matches.length === 0) {
    const error = new Error("That exact review video is not currently waiting at the owner approval gate.");
    error.status = 409;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error("Multiple approval gates matched that exact review video; approval was blocked for safety.");
    error.status = 409;
    throw error;
  }

  const run = matches[0];
  const pending = await githubJson(
    `/repos/${safeOwner}/${safeRepo}/actions/runs/${run.id}/pending_deployments`,
    { token, fetchImpl },
  );
  const approvable = (Array.isArray(pending) ? pending : []).filter(
    (item) => item?.environment?.name === APPROVAL_ENVIRONMENT && item.current_user_can_approve === true,
  );

  if (!approvable.length) {
    const error = new Error("The exact review video is not currently approvable by the owner approval account.");
    error.status = 409;
    throw error;
  }

  await githubJson(
    `/repos/${safeOwner}/${safeRepo}/actions/runs/${run.id}/pending_deployments`,
    {
      token,
      fetchImpl,
      method: "POST",
      body: {
        environment_ids: approvable.map((item) => item.environment.id),
        state: "approved",
        comment: "Approved from BlindBoxAI Owner Dashboard after owner watched the exact review video.",
      },
    },
  );

  return {
    status: "approved",
    approvedRuns: 1,
    runId: run.id,
    workflowFile: MANUAL_REVIEW_WORKFLOW,
    videoUrl: target,
    environments: approvable.map((item) => item.environment.name),
    htmlUrl: run.html_url ?? null,
  };
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
          comment: "Approved from BlindBoxAI Owner Dashboard after owner review — launch all ready video jobs.",
        },
      },
    );
    approved.push({ runId: run.runId, workflowFile: run.workflowFile, htmlUrl: run.htmlUrl, environments: run.environmentNames });
  }

  return {
    status: approved.length ? "approved" : "nothing_ready",
    approvedRuns: approved.length,
    approvedEnvironments: approved.reduce((sum, item) => sum + item.environments.length, 0),
    approved,
    skipped,
    workflows: VIDEO_WORKFLOWS,
    scope: "main:social-production",
  };
}
