import {
  DISCLOSURE,
  createBufferPublisher,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";

const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";
const BLINDBOXAI_URL = "https://www.blindboxai.com";
const OIDC_AUDIENCE = "blindboxai-review-publisher";

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

async function getGithubOidcToken(fetchImpl = fetch) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error("GitHub OIDC environment is unavailable");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", OIDC_AUDIENCE);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!response.ok) throw new Error(`GitHub OIDC request failed: ${response.status}`);
  const body = await response.json();
  return required(body?.value, "GitHub OIDC token");
}

async function queueRequest(token, body, fetchImpl = fetch) {
  const response = await fetchImpl(REVIEW_QUEUE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Review queue request failed: ${response.status}`);
  return data;
}

const token = await getGithubOidcToken();
const claimed = await queueRequest(token, { action: "claim" });
const item = claimed?.item;
if (!item) {
  console.log("REVIEW_QUEUE_EMPTY: true");
  process.exit(0);
}

const channels = [...new Set(String(process.env.VIDEO_CHANNELS ?? "youtube,tiktok")
  .split(",").map((value) => value.trim()).filter(Boolean))];
if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one service");

const publisher = createBufferPublisher({
  token: process.env.BUFFER_API_TOKEN,
  organizationId: process.env.BUFFER_ORGANIZATION_ID,
});

const results = [];
try {
  for (const channel of channels) {
    const trackedCta = buildTrackedSocialCta(BLINDBOXAI_URL, {
      runId: item.research_run_id,
      service: channel,
    });
    const script = {
      title: item.title,
      facts: [item.vertical === "pokemon_tcg" ? "Pokémon collectible research." : "Owner-reviewed BlindBoxAI collectible research."],
      productUrl: trackedCta,
    };
    const caption = videoCaptionForService(script, channel);
    if (!caption.includes(trackedCta) || !caption.includes(DISCLOSURE)) {
      throw new Error(`${channel}: tracked CTA and affiliate disclosure are required`);
    }
    const result = await publisher({ channel, videoUrl: item.video_url, caption });
    results.push({ channel, id: result.id, duplicate: result.duplicate === true });
    console.log(`REVIEW_QUEUE_PUBLISHED: ${channel}:${result.id}`);
  }

  await queueRequest(token, { action: "complete", researchRunId: item.research_run_id, success: true });
  console.log(`REVIEW_QUEUE_COMPLETE: ${item.research_run_id}`);
} catch (error) {
  await queueRequest(token, { action: "complete", researchRunId: item.research_run_id, success: false, error: error instanceof Error ? error.message : String(error) }).catch(() => {});
  throw error;
}
