import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_AUDIENCE = "blindboxai-video-publisher";
const GITHUB_REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const ALLOWED_WORKFLOWS = new Set([
  `${GITHUB_REPOSITORY}/.github/workflows/manual-reviewed-video.yml@refs/heads/main`,
  `${GITHUB_REPOSITORY}/.github/workflows/publish-approved-reviews.yml@refs/heads/main`,
  `${GITHUB_REPOSITORY}/.github/workflows/autonomous-video.yml@refs/heads/main`,
]);
const githubJwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", "access-control-allow-origin": "*" } });
}

function clean(value: unknown, max = 240) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeHttps(value: unknown) {
  try { const url = new URL(clean(value, 500)); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

async function authorized(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return false;
    const { payload } = await jwtVerify(token, githubJwks, { issuer: GITHUB_ISSUER, audience: GITHUB_AUDIENCE });
    const workflowRef = String(payload.workflow_ref || "");
    if (payload.repository !== GITHUB_REPOSITORY || payload.ref !== "refs/heads/main" || !ALLOWED_WORKFLOWS.has(workflowRef)) return false;
    if (workflowRef.endsWith("/autonomous-video.yml@refs/heads/main") && payload.event_name !== "workflow_dispatch") return false;
    return true;
  } catch { return false; }
}

async function handleFeed() {
  const { data, error } = await db.from("published_collectible_videos")
    .select("research_run_id,title,vertical,video_url,channels,campaign_id,status,published_at")
    .in("status", ["published", "partial"])
    .order("published_at", { ascending: false })
    .limit(12);
  if (error) return json({ error: "Video feed unavailable" }, 500);
  return json({ ok: true, items: data || [] });
}

function normalizedChannelList(value: unknown) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => clean(item, 40))
      .filter(Boolean),
  )].sort();
}

function normalizedObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function handlePublish(req: Request) {
  if (!await authorized(req)) return json({ error: "GitHub video publisher authorization required" }, 403);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const researchRunId = clean(body?.researchRunId, 40);
  const requestedVideoUrl = safeHttps(body?.videoUrl);
  const requestedCampaignId = clean(body?.campaignId, 80);
  const requestedChannels = normalizedChannelList(body?.channels);
  if (
    !/^rv-[a-f0-9]{16}$/.test(researchRunId) ||
    !requestedVideoUrl ||
    requestedCampaignId !== `bb-${researchRunId}` ||
    !requestedChannels.length
  ) {
    return json({ error: "Published video fields invalid" }, 400);
  }

  const { data: queueRow, error: queueError } = await db
    .from("review_video_queue")
    .select("research_run_id,title,vertical,video_url,status,approved_at,published_channels,buffer_post_ids,public_urls,published_at")
    .eq("research_run_id", researchRunId)
    .maybeSingle();
  if (queueError) return json({ error: "Review queue lookup failed" }, 500);
  if (!queueRow) return json({ error: "Published review row not found" }, 409);
  if (
    queueRow.status !== "published" ||
    !queueRow.approved_at ||
    queueRow.video_url !== requestedVideoUrl
  ) {
    return json({ error: "Review row is not approved and published for this canonical video" }, 409);
  }

  const canonicalChannels = normalizedChannelList(queueRow.published_channels);
  if (!sameJson(canonicalChannels, requestedChannels)) {
    return json({ error: "Published channel set does not match review queue" }, 409);
  }
  const publicUrls = normalizedObject(queueRow.public_urls);
  if (!canonicalChannels.every((channel) => Boolean(safeHttps(publicUrls[channel])))) {
    return json({ error: "Verified public URLs are missing from review queue" }, 409);
  }

  const canonical = {
    research_run_id: researchRunId,
    title: clean(queueRow.title, 120),
    vertical: clean(queueRow.vertical, 80) || "other_collectible",
    video_url: requestedVideoUrl,
    channels: canonicalChannels,
    buffer_post_ids: normalizedObject(queueRow.buffer_post_ids),
    campaign_id: requestedCampaignId,
    status: "published",
  };
  if (!canonical.title) return json({ error: "Published review title missing" }, 409);

  const { data: existing, error: existingError } = await db
    .from("published_collectible_videos")
    .select("research_run_id,title,vertical,video_url,channels,buffer_post_ids,campaign_id,status,published_at")
    .eq("research_run_id", researchRunId)
    .maybeSingle();
  if (existingError) return json({ error: "Published video lookup failed" }, 500);

  if (existing) {
    const existingCanonical = {
      research_run_id: existing.research_run_id,
      title: existing.title,
      vertical: existing.vertical,
      video_url: existing.video_url,
      channels: normalizedChannelList(existing.channels),
      buffer_post_ids: normalizedObject(existing.buffer_post_ids),
      campaign_id: existing.campaign_id,
      status: existing.status,
    };
    if (!sameJson(existingCanonical, canonical)) {
      return json({ error: "Published video conflict" }, 409);
    }
    return json({ ok: true, researchRunId, idempotent: true, publishedAt: existing.published_at });
  }

  const now = queueRow.published_at || new Date().toISOString();
  const { error } = await db.from("published_collectible_videos").insert({
    ...canonical,
    published_at: now,
    updated_at: now,
  });
  if (error) return json({ error: "Published video storage failed" }, 500);
  return json({ ok: true, researchRunId, idempotent: false, publishedAt: now });
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return handleFeed();
  if (req.method === "POST") return handlePublish(req);
  return json({ error: "Method not allowed" }, 405);
});