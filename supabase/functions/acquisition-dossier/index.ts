import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_AUDIENCE = "blindboxai-acquisition-dossier";
const GITHUB_REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const GITHUB_WORKFLOW_REF = `${GITHUB_REPOSITORY}/.github/workflows/monthly-acquisition-dossier.yml@refs/heads/main`;
const githubJwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store", ...headers },
  });
}
function clean(value: unknown, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
async function githubAuthorized(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { payload } = await jwtVerify(token, githubJwks, { issuer: GITHUB_ISSUER, audience: GITHUB_AUDIENCE });
    if (
      payload.repository !== GITHUB_REPOSITORY ||
      payload.ref !== "refs/heads/main" ||
      payload.workflow_ref !== GITHUB_WORKFLOW_REF ||
      !["schedule","workflow_dispatch"].includes(String(payload.event_name || ""))
    ) return null;
    return payload;
  } catch { return null; }
}
async function ownerAuthorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  try {
    const response = await fetch("https://www.blindboxai.com/api/owner/control-auth", {
      method: "POST",
      headers: { Authorization: auth },
    });
    return response.ok;
  } catch { return false; }
}
function previousMonth(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
function noData() { return "no data"; }

async function generate(auth: any) {
  const { start, end } = previousMonth();
  const [visits, clicks, videos, verifiedItems] = await Promise.all([
    db.from("analytics_events").select("id", { count: "exact", head: true })
      .eq("event_name", "page_view").gte("captured_at", start).lt("captured_at", end),
    db.from("affiliate_clicks").select("provider").gte("clicked_at", start).lt("clicked_at", end),
    db.from("published_collectible_videos")
      .select("research_run_id,title,channels,buffer_post_ids,published_at")
      .gte("published_at", start).lt("published_at", end).order("published_at"),
    db.from("collectible_sold_value_summary").select("query_key").gte("verified_sale_count", 2),
  ]);
  for (const result of [visits, clicks, videos, verifiedItems]) {
    if (result.error) return json({ error: "Dossier source query failed" }, 500);
  }

  const providerCounts: Record<string,number> = {};
  for (const row of clicks.data || []) {
    const provider = clean(row.provider, 80) || "unknown";
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;
  }
  const ebayClicks = Object.entries(providerCounts).filter(([k]) => k.startsWith("ebay")).reduce((n,[,v])=>n+v,0);
  const amazonClicks = providerCounts.amazon_associates || 0;
  const published = (videos.data || []).map((row:any) => ({
    researchRunId: row.research_run_id,
    title: row.title,
    publishedAt: row.published_at,
    channels: Array.isArray(row.channels) ? row.channels : [],
    channelRecords: Object.fromEntries((Array.isArray(row.channels) ? row.channels : []).map((channel:string) => [
      channel,
      { bufferPostId: row.buffer_post_ids?.[channel] || noData(), publicUrl: noData() },
    ])),
  }));

  const payload = {
    schema: "blindboxai/acquisition-dossier/v1",
    period: { start, end },
    generatedAt: new Date().toISOString(),
    metrics: {
      siteVisits: visits.count ?? noData(),
      outboundClicks: { ebay: ebayClicks, amazon: amazonClicks, byProvider: providerCounts },
      epnEarnings: noData(),
      videosPublished: published,
      verifiedItemCount: (verifiedItems.data || []).length,
      authenticityChecksByStatus: noData(),
    },
    sourceNotes: {
      epnEarnings: "no data — manual CSV summary is not currently stored in a Supabase source available to this generator",
      publicVideoUrls: "no data — published_collectible_videos stores Buffer post IDs, not confirmed public social URLs",
      authenticityChecks: "no data — no authenticity-check status table exists in the current Supabase schema",
    },
  };
  const md = [
    `# BlindBoxAI acquisition dossier — ${start.slice(0,7)}`,
    "",
    `Period: ${start} to ${end}`,
    `Generated: ${payload.generatedAt}`,
    "",
    `- Site visits: ${payload.metrics.siteVisits}`,
    `- Outbound eBay clicks: ${ebayClicks}`,
    `- Outbound Amazon clicks: ${amazonClicks}`,
    `- EPN earnings: ${payload.metrics.epnEarnings}`,
    `- Verified items (2+ verified sales): ${payload.metrics.verifiedItemCount}`,
    `- Authenticity checks by status: ${payload.metrics.authenticityChecksByStatus}`,
    `- Published video records: ${published.length}`,
    "",
    "## Published videos",
    ...(published.length ? published.flatMap((v:any) => [
      `- ${v.title} (${v.researchRunId}) — ${v.channels.join(", ") || "no data"}`,
      ...Object.entries(v.channelRecords).map(([ch,rec]:any)=>`  - ${ch}: public URL ${rec.publicUrl}; Buffer post ID ${rec.bufferPostId}`),
    ]) : ["- no data"]),
    "",
    "## Source gaps",
    `- EPN earnings: ${payload.sourceNotes.epnEarnings}`,
    `- Public video URLs: ${payload.sourceNotes.publicVideoUrls}`,
    `- Authenticity checks: ${payload.sourceNotes.authenticityChecks}`,
    "",
  ].join("\n");

  const { error } = await db.from("acquisition_dossiers").upsert({
    period_start: start,
    period_end: end,
    payload,
    markdown: md,
    github_run_id: clean(auth?.run_id, 80) || null,
    commit_sha: /^[a-f0-9]{40}$/.test(clean(auth?.sha, 40)) ? clean(auth?.sha, 40) : null,
    generated_at: payload.generatedAt,
  }, { onConflict: "period_start,period_end" });
  if (error) return json({ error: "Dossier persistence failed" }, 500);
  return json({ ok: true, periodStart: start, periodEnd: end });
}

async function latest(req: Request) {
  if (!await ownerAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const { data, error } = await db.from("acquisition_dossiers")
    .select("period_start,period_end,generated_at,payload,markdown")
    .order("period_start", { ascending: false }).limit(1).maybeSingle();
  if (error) return json({ error: "Dossier lookup failed" }, 500);
  if (!data) return json({ error: "No dossier available" }, 404);
  return json({ ok: true, dossier: data });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body:any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (body?.action === "latest") return latest(req);
  if (body?.action !== "generate") return json({ error: "Unknown action" }, 400);
  const auth = await githubAuthorized(req);
  if (!auth) return json({ error: "GitHub OIDC authorization required" }, 403);
  return generate(auth);
});
