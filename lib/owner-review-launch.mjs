const API_ROOT = "https://api.github.com";
const DEFAULT_OWNER = "ubiquitousservices888-rgb";
const DEFAULT_REPO = "BlindBoxAi-";
const REVIEW_PUBLISH_WORKFLOW = "publish-approved-reviews.yml";
const API_VERSION = "2022-11-28";
const PUBLISH_CHANNELS = Object.freeze(["youtube", "tiktok"]);

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

async function dispatchWorkflow({ owner, repo, token, channel, researchRunId, youtubeAudience, fetchImpl }) {
  const response = await fetchImpl(
    `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${REVIEW_PUBLISH_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${required(token, "GITHUB_OWNER_APPROVAL_TOKEN")}`,
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          dry_run: false,
          publish_channel: channel,
          research_run_id: researchRunId,
          youtube_audience: youtubeAudience,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = new Error(`GitHub review publish dispatch failed for ${channel} with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

export async function dispatchApprovedReviewPublication({
  token,
  researchRunId,
  youtubeAudience,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  fetchImpl = fetch,
} = {}) {
  const runId = validRunId(researchRunId);
  const audience = validYoutubeAudience(youtubeAudience);
  required(owner, "owner");
  required(repo, "repo");

  const dispatchedChannels = [];
  for (const channel of PUBLISH_CHANNELS) {
    await dispatchWorkflow({
      owner,
      repo,
      token,
      channel,
      researchRunId: runId,
      youtubeAudience: audience,
      fetchImpl,
    });
    dispatchedChannels.push(channel);
  }

  return {
    status: "dispatched",
    workflow: REVIEW_PUBLISH_WORKFLOW,
    researchRunId: runId,
    channels: dispatchedChannels,
    youtubeAudience: audience,
  };
}
