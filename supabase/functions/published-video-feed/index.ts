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

async function handlePublish(req: Request) {
  if (!await authorized(req)) return json({ error: "GitHub video publisher authorization required" }, 403);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const researchRunId = clean(body?.researchRunId, 40);
  const title = clean(body?.title, 120);
  const vertical = clean(body?.vertical, 80) || "other_collectible";
  const videoUrl = safeHttps(body?.videoUrl);
  const campaignId = clean(body?.campaignId, 80) || null;
  const channels = Array.isArray(body?.channels) ? body.channels.map((v: unknown) => clean(v, 40)).filter(Boolean).slice(0, 10) : [];
  const bufferPostIds = body?.bufferPostIds && typeof body.bufferPostIds === "object" ? body.bufferPostIds : {};

  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId) || !title || !videoUrl || !channels.length) return json({ error: "Published video fields invalid" }, 400);

  const now = new Date().toISOString();
  const { error } = await db.from("published_collectible_videos").upsert({
    research_run_id: researchRunId,
    title,
    vertical,
    video_url: videoUrl,
    channels,
    buffer_post_ids: bufferPostIds,
    campaign_id: campaignId,
    status: "published",
    published_at: now,
    updated_at: now,
  }, { onConflict: "research_run_id" });
  if (error) return json({ error: "Published video storage failed" }, 500);
  return json({ ok: true, researchRunId });
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return handleFeed();
  if (req.method === "POST") return handlePublish(req);
  return json({ error: "Method not allowed" }, 405);
});