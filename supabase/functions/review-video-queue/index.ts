import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";
import { createHash } from "node:crypto";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_AUDIENCE = "blindboxai-review-publisher";
const GITHUB_REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const GITHUB_WORKFLOW_REF = `${GITHUB_REPOSITORY}/.github/workflows/publish-approved-reviews.yml@refs/heads/main`;
const githubJwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function cors() {
  return {
    "access-control-allow-origin": "https://www.blindboxai.com",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...cors() } });
}
function clean(value: unknown, max = 240) { return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function safeHttps(value: unknown) { try { const url = new URL(clean(value, 500)); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function safePublicUrl(channel: string, value: unknown) {
  const raw = safeHttps(value);
  if (!raw) return null;
  const url = new URL(raw);
  if (url.port) return null;
  const host = url.hostname.toLowerCase();
  if (channel === "youtube") {
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) return null;
    if (host === "youtu.be" && /^\/[A-Za-z0-9_-]{6,}(?:\/)?$/.test(url.pathname)) return url.toString();
    if (url.pathname === "/watch" && /^[A-Za-z0-9_-]{6,}$/.test(url.searchParams.get("v") || "")) return url.toString();
    if (/^\/(?:shorts|live)\/[A-Za-z0-9_-]{6,}(?:\/)?$/.test(url.pathname)) return url.toString();
    return null;
  }
  if (channel === "tiktok" && ["tiktok.com", "www.tiktok.com"].includes(host) && /^\/@[^/]+\/video\/\d+(?:\/)?$/.test(url.pathname)) {
    return url.toString();
  }
  if (channel === "twitter" && ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(host)) {
    if (/^\/(?:i\/web\/|[^/]+\/)status\/\d+(?:\/)?$/.test(url.pathname)) return url.toString();
  }
  return null;
}
function verticalFor(title: string) {
  const t = title.toLowerCase();
  if (/pokemon|pokémon|pikachu|charizard|mewtwo|umbreon|jigglypuff|turtwig/.test(t)) return "pokemon_tcg";
  if (/topps|panini|bowman|rookie|baseball|basketball|football|hockey|sports card/.test(t)) return "sports_cards";
  if (/magic|mtg|black lotus/.test(t)) return "magic_the_gathering";
  if (/labubu|pop mart|skullpanda|hirono|dimoo/.test(t)) return "pop_mart";
  return "other_collectible";
}
async function stagingAuthorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  try {
    const response = await fetch("https://www.blindboxai.com/api/owner/storage-auth", { method: "POST", headers: { Authorization: auth } });
    return response.ok;
  } catch { return false; }
}
async function ownerControlAuthorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  try {
    const response = await fetch("https://www.blindboxai.com/api/owner/control-auth", { method: "POST", headers: { Authorization: auth } });
    return response.ok;
  } catch { return false; }
}
async function githubAuthorized(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return false;
    const { payload } = await jwtVerify(token, githubJwks, { issuer: GITHUB_ISSUER, audience: GITHUB_AUDIENCE });
    return payload.repository === GITHUB_REPOSITORY && payload.ref === "refs/heads/main" && payload.workflow_ref === GITHUB_WORKFLOW_REF;
  } catch { return false; }
}
async function stage(req: Request, body: any) {
  if (!await stagingAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const videoUrl = safeHttps(body?.videoUrl); const title = clean(body?.title, 120);
  const sizeBytes = Number(body?.sizeBytes || 0), durationSeconds = Number(body?.durationSeconds || 0), width = Number(body?.width || 0), height = Number(body?.height || 0);
  if (!videoUrl || !title || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 104857600 || ![durationSeconds,width,height].every((v) => Number.isFinite(v) && v > 0)) return json({ error: "Invalid review metadata" }, 400);
  const researchRunId = `rv-${createHash("sha256").update(videoUrl).digest("hex").slice(0,16)}`;
  const { data: existing, error: existingError } = await db.from("review_video_queue")
    .select("status")
    .eq("research_run_id", researchRunId)
    .maybeSingle();
  if (existingError) return json({ error: "Queue lookup failed" }, 500);
  if (existing?.status === "rejected") return json({ error: "Rejected review rows are immutable" }, 409);
  const now = new Date().toISOString();
  const { error } = await db.from("review_video_queue").upsert({ research_run_id: researchRunId, video_url: videoUrl, title, size_bytes: Math.round(sizeBytes), duration_seconds: durationSeconds, width: Math.round(width), height: Math.round(height), vertical: verticalFor(title), status: "ready_for_review", rejection_reason: null, rejected_at: null, last_error: null, updated_at: now }, { onConflict: "research_run_id" });
  if (error) return json({ error: "Unable to stage video" }, 500);
  return json({ status: "staged_for_owner_review", state: "READY_FOR_REVIEW", approved: false, videoUrl, title, researchRunId, campaignId: `bb-${researchRunId}` });
}
async function listReady(req: Request) {
  if (!await stagingAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const { data, error } = await db.from("review_video_queue")
    .select("research_run_id,video_url,title,vertical,size_bytes,duration_seconds,width,height,status,approved_at,created_at,updated_at")
    .in("status", ["ready_for_review","approved","publishing"])
    .order("created_at", { ascending: false }).limit(20);
  if (error) return json({ error: "Queue lookup failed" }, 500);
  return json({ ok: true, items: data || [] });
}
async function approve(req: Request, body: any) {
  if (!await ownerControlAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const videoUrl = safeHttps(body?.videoUrl); if (!videoUrl) return json({ error: "Invalid video URL" }, 400);
  const now = new Date().toISOString();
  const { data, error } = await db.from("review_video_queue").update({ status: "approved", approved_at: now, updated_at: now, last_error: null }).eq("video_url", videoUrl).eq("status", "ready_for_review").select("research_run_id,video_url,title,vertical").maybeSingle();
  if (error) return json({ error: "Approval failed" }, 500);
  if (!data) return json({ error: "Video is not waiting for approval" }, 409);
  return json({ ok: true, state: "APPROVED", ...data });
}
async function reject(req: Request, body: any) {
  if (!await ownerControlAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const researchRunId = clean(body?.researchRunId, 40);
  const reason = clean(body?.reason, 32).toLowerCase();
  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) return json({ error: "Invalid researchRunId" }, 400);
  if (!["duplicate","owner_rejected","test"].includes(reason)) return json({ error: "Invalid rejection reason" }, 400);
  const now = new Date().toISOString();
  const { data, error } = await db.from("review_video_queue")
    .update({ status: "rejected", rejection_reason: reason, rejected_at: now, publishing_at: null, updated_at: now, last_error: null })
    .eq("research_run_id", researchRunId)
    .in("status", ["ready_for_review","approved"])
    .select("research_run_id,title,status,rejection_reason,rejected_at")
    .maybeSingle();
  if (error) return json({ error: "Rejection failed" }, 500);
  if (!data) return json({ error: "Video is not rejectable" }, 409);
  return json({ ok: true, item: data });
}
function requestedPublishChannel(body: any) {
  const channel = clean(body?.channel, 32).toLowerCase();
  if (!channel) return "";
  if (!/^[a-z0-9_-]{2,32}$/.test(channel)) throw new Error("Invalid publish channel");
  return channel;
}
function requestedResearchRunId(body: any) {
  const researchRunId = clean(body?.researchRunId, 40).toLowerCase();
  if (!researchRunId) return "";
  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) throw new Error("Invalid researchRunId");
  return researchRunId;
}

async function nextApprovedForChannel(channel: string, researchRunId = "") {
  let query = db.from("review_video_queue")
    .select("research_run_id,video_url,title,vertical,published_channels,buffer_post_ids,public_urls")
    .eq("status", "approved")
    .order("approved_at", { ascending: true });
  if (researchRunId) query = query.eq("research_run_id", researchRunId);
  const { data, error } = await query.limit(researchRunId ? 1 : 100);
  if (error) throw error;
  return (data || []).find((item: any) => {
    if (!channel) return true;
    const channels = Array.isArray(item.published_channels) ? item.published_channels : [];
    const urls = item.public_urls && typeof item.public_urls === "object" ? item.public_urls : {};
    return !channels.includes(channel) || !safePublicUrl(channel, urls[channel]);
  }) || null;
}

async function peek(req: Request, body: any) {
  if (!await githubAuthorized(req)) return json({ error: "GitHub publisher authorization required" }, 403);
  let channel = "", researchRunId = "";
  try {
    channel = requestedPublishChannel(body);
    researchRunId = requestedResearchRunId(body);
  } catch { return json({ error: "Invalid publish selector" }, 400); }
  try {
    const item = await nextApprovedForChannel(channel, researchRunId);
    return json({ ok: true, item });
  } catch {
    return json({ error: "Queue lookup failed" }, 500);
  }
}

async function claim(req: Request, body: any) {
  if (!await githubAuthorized(req)) return json({ error: "GitHub publisher authorization required" }, 403);
  let channel = "", researchRunId = "";
  try {
    channel = requestedPublishChannel(body);
    researchRunId = requestedResearchRunId(body);
  } catch { return json({ error: "Invalid publish selector" }, 400); }
  let item: any;
  try { item = await nextApprovedForChannel(channel, researchRunId); }
  catch { return json({ error: "Queue lookup failed" }, 500); }
  if (!item) return json({ ok: true, item: null });
  const now = new Date().toISOString();
  const { data: claimed } = await db.from("review_video_queue")
    .update({ status: "publishing", publishing_at: now, updated_at: now })
    .eq("research_run_id", item.research_run_id)
    .eq("status", "approved")
    .select("research_run_id,video_url,title,vertical,published_channels,buffer_post_ids,public_urls")
    .maybeSingle();
  return json({ ok: true, item: claimed || null });
}
async function recordChannel(req: Request, body: any) {
  if (!await githubAuthorized(req)) return json({ error: "GitHub publisher authorization required" }, 403);
  const researchRunId = clean(body?.researchRunId, 40);
  const channel = clean(body?.channel, 32).toLowerCase();
  const externalId = clean(body?.externalId, 200);
  const publicUrl = safePublicUrl(channel, body?.publicUrl);
  const targetChannels = [...new Set((Array.isArray(body?.targetChannels) ? body.targetChannels : [])
    .map((value: unknown) => clean(value, 32).toLowerCase())
    .filter((value: string) => /^[a-z0-9_-]{2,32}$/.test(value)))];
  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) return json({ error: "Invalid researchRunId" }, 400);
  if (!/^[a-z0-9_-]{2,32}$/.test(channel) || !externalId || !publicUrl) return json({ error: "Invalid verified channel publication" }, 400);
  if (!targetChannels.length || !targetChannels.includes(channel)) return json({ error: "Invalid target channel set" }, 400);

  const { data: current, error: readError } = await db.from("review_video_queue")
    .select("published_channels,buffer_post_ids,public_urls")
    .eq("research_run_id", researchRunId)
    .eq("status", "publishing")
    .maybeSingle();
  if (readError) return json({ error: "Queue lookup failed" }, 500);
  if (!current) return json({ error: "Queue item is not currently publishing" }, 409);

  const publishedChannels = [...new Set([...(Array.isArray(current.published_channels) ? current.published_channels : []), channel])];
  const bufferPostIds = { ...(current.buffer_post_ids && typeof current.buffer_post_ids === "object" ? current.buffer_post_ids : {}), [channel]: externalId };
  const publicUrls = { ...(current.public_urls && typeof current.public_urls === "object" ? current.public_urls : {}), [channel]: publicUrl };
  const allDone = targetChannels.every((value: string) =>
    publishedChannels.includes(value) && Boolean(safePublicUrl(value, publicUrls[value]))
  );
  const now = new Date().toISOString();
  const patch = allDone
    ? { status: "published", published_channels: publishedChannels, buffer_post_ids: bufferPostIds, public_urls: publicUrls, published_at: now, updated_at: now, last_error: null }
    : { status: "approved", published_channels: publishedChannels, buffer_post_ids: bufferPostIds, public_urls: publicUrls, publishing_at: null, updated_at: now, last_error: null };

  const { data, error } = await db.from("review_video_queue")
    .update(patch)
    .eq("research_run_id", researchRunId)
    .eq("status", "publishing")
    .select("research_run_id,video_url,title,vertical,status,published_channels,buffer_post_ids,public_urls")
    .maybeSingle();
  if (error) return json({ error: "Queue channel update failed" }, 500);
  if (!data) return json({ error: "Queue channel update lost its publishing lease" }, 409);
  return json({ ok: true, item: data, complete: allDone });
}

async function release(req: Request, body: any) {
  if (!await githubAuthorized(req)) return json({ error: "GitHub publisher authorization required" }, 403);
  const researchRunId = clean(body?.researchRunId, 40);
  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) return json({ error: "Invalid researchRunId" }, 400);
  const now = new Date().toISOString();
  const { error } = await db.from("review_video_queue")
    .update({
      status: "approved",
      publishing_at: null,
      updated_at: now,
      last_error: clean(body?.error, 500) || "Public post verification pending",
    })
    .eq("research_run_id", researchRunId)
    .eq("status", "publishing");
  if (error) return json({ error: "Queue release failed" }, 500);
  return json({ ok: true });
}

async function complete(req: Request, body: any) {
  if (!await githubAuthorized(req)) return json({ error: "GitHub publisher authorization required" }, 403);
  const researchRunId = clean(body?.researchRunId, 40);
  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) return json({ error: "Invalid researchRunId" }, 400);
  if (body?.success === true) {
    return json({ error: "Verified channel URLs must be recorded with record_channel" }, 409);
  }
  const now = new Date().toISOString();
  const { error } = await db.from("review_video_queue")
    .update({ status: "failed", updated_at: now, last_error: clean(body?.error, 500) || "Publish failed" })
    .eq("research_run_id", researchRunId)
    .eq("status", "publishing");
  if (error) return json({ error: "Queue update failed" }, 500);
  return json({ ok: true });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = clean(body?.action, 30);
  if (action === "stage") return stage(req, body);
  if (action === "list") return listReady(req);
  if (action === "approve") return approve(req, body);
  if (action === "reject") return reject(req, body);
  if (action === "peek") return peek(req, body);
  if (action === "claim") return claim(req, body);
  if (action === "record_channel") return recordChannel(req, body);
  if (action === "release") return release(req, body);
  if (action === "complete") return complete(req, body);
  return json({ error: "Unknown action" }, 400);
});