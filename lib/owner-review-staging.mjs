const API_ROOT = "https://api.github.com";
const DEFAULT_OWNER = "ubiquitousservices888-rgb";
const DEFAULT_REPO = "BlindBoxAi-";
const REVIEW_WORKFLOW = "manual-reviewed-video.yml";
const API_VERSION = "2022-11-28";
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function safeTitle(value) {
  const title = required(value, "title").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  if (/https?:\/\//i.test(title)) throw new Error("title must not contain a URL");
  return title;
}

function validateVideoUrl(value) {
  const text = required(value, "videoUrl");
  let url;
  try { url = new URL(text); } catch { throw new Error("videoUrl must be a valid URL"); }
  if (url.protocol !== "https:") throw new Error("videoUrl must use HTTPS");
  if (!url.pathname.startsWith("/media/review/")) throw new Error("videoUrl must use the /media/review/ namespace");
  if (!/\.mp4$/i.test(url.pathname)) throw new Error("videoUrl must point to an MP4");
  return url.toString();
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive number`);
  return number;
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
    const error = new Error(`GitHub review staging request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function stageOwnerReviewedVideo({
  token,
  videoUrl,
  title,
  sizeBytes,
  durationSeconds,
  width,
  height,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  fetchImpl = fetch,
} = {}) {
  const safeOwner = encodeURIComponent(required(owner, "owner"));
  const safeRepo = encodeURIComponent(required(repo, "repo"));
  const safeVideoUrl = validateVideoUrl(videoUrl);
  const safeVideoTitle = safeTitle(title);
  const safeSize = positiveNumber(sizeBytes, "sizeBytes");
  if (safeSize > MAX_VIDEO_SIZE) throw new Error("sizeBytes exceeds the 100 MB review limit");
  const safeDuration = positiveNumber(durationSeconds, "durationSeconds");
  const safeWidth = positiveNumber(width, "width");
  const safeHeight = positiveNumber(height, "height");

  await githubJson(
    `/repos/${safeOwner}/${safeRepo}/actions/workflows/${REVIEW_WORKFLOW}/dispatches`,
    {
      token,
      fetchImpl,
      method: "POST",
      body: {
        ref: "main",
        inputs: {
          video_url: safeVideoUrl,
          title: safeVideoTitle,
          size_bytes: String(Math.round(safeSize)),
          duration_seconds: String(safeDuration),
          width: String(Math.round(safeWidth)),
          height: String(Math.round(safeHeight)),
        },
      },
    },
  );

  return {
    status: "staged_for_owner_review",
    state: "READY_FOR_REVIEW",
    approved: false,
    videoUrl: safeVideoUrl,
    title: safeVideoTitle,
    workflow: REVIEW_WORKFLOW,
    environment: "social-production",
  };
}
