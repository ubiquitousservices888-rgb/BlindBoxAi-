// Isolated, fail-closed PostgREST store for owner-reviewed Buffer scheduling.
// Not production-wired. A claim is NOT approval, a published video, or revenue proof.
const RUN_ID = /^rv-[a-f0-9]{16}$/;
const CHANNELS = new Set(["youtube", "tiktok"]);

function validateIdentity({researchRunId, channel, channelId, videoUrl}) {
  if (!RUN_ID.test(String(researchRunId ?? "")) || !CHANNELS.has(channel) ||
      typeof channelId !== "string" || !channelId.trim() ||
      typeof videoUrl !== "string" || !videoUrl.startsWith("https://")) {
    throw new Error("Invalid canonical review scheduling identity");
  }
}

export function createPostgrestReviewScheduleStore({
  baseUrl, apiKey, bearerToken, fetchImpl = fetch,
}) {
  let root;
  try { root = new URL(baseUrl); } catch { throw new Error("Invalid PostgREST endpoint"); }
  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(root.hostname);
  if (root.username || root.password || root.search || root.hash ||
      (root.protocol !== "https:" && !(loopback && root.protocol === "http:"))) {
    throw new Error("Scheduling store requires a trusted HTTPS endpoint");
  }
  if (!loopback && (!apiKey || !bearerToken)) {
    throw new Error("Scheduling store credentials are required");
  }
  if (typeof fetchImpl !== "function") throw new Error("Scheduling store transport required");

  async function request(method, table, params, body, prefer) {
    const url = new URL(root.toString().replace(/[/]$/, "") + "/" + table);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const headers = {"content-type":"application/json", "accept":"application/json"};
    if (apiKey) headers.apikey = apiKey;
    if (bearerToken) headers.authorization = "Bearer " + bearerToken;
    if (prefer) headers.prefer = prefer;
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method, headers, ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      });
    } catch {
      throw new Error("Scheduling store request failed; retain claim and reconcile");
    }
    if (!response.ok) throw new Error("Scheduling store rejected request (HTTP " + response.status + ")");
    let rows;
    try { rows = await response.json(); } catch {
      throw new Error("Scheduling store returned an invalid receipt; reconcile");
    }
    if (!Array.isArray(rows)) throw new Error("Scheduling store returned an invalid receipt; reconcile");
    return rows;
  }

  function key(researchRunId, channel) {
    return {research_run_id:"eq." + researchRunId, channel:"eq." + channel};
  }

  async function claimScheduleImpl(identity) {
    validateIdentity(identity);
    const {researchRunId,channel,channelId,videoUrl} = identity;
    const rows = await request("POST", "review_schedule_claims",
      {on_conflict:"research_run_id,channel"},
      [{research_run_id:researchRunId, channel, channel_id:channelId,
        media_url:videoUrl, status:"claimed"}],
      "resolution=ignore-duplicates,return=representation");
    if (rows.length === 0) return {claimed:false};
    if (rows.length !== 1 || rows[0].research_run_id !== researchRunId ||
        rows[0].channel !== channel || rows[0].channel_id !== channelId ||
        rows[0].media_url !== videoUrl || rows[0].status !== "claimed") {
      throw new Error("Scheduling claim identity mismatch; reconcile");
    }
    return {claimed:true};
  }

  async function recordScheduledReceipt(identity) {
    validateIdentity(identity);
    const {researchRunId,channel,channelId,videoUrl,bufferPostId,dueAt} = identity;
    if (typeof bufferPostId !== "string" || !bufferPostId.trim() ||
        typeof dueAt !== "string" || !Number.isFinite(Date.parse(dueAt)) ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(dueAt)) {
      throw new Error("Exact Buffer scheduled receipt required");
    }
    const rows = await request("PATCH", "review_schedule_claims", {
      ...key(researchRunId,channel),
      channel_id:"eq." + channelId,
      media_url:"eq." + videoUrl,
      status:"eq.claimed", buffer_post_id:"is.null",
    }, {status:"scheduled",buffer_post_id:bufferPostId,due_at:dueAt},
    "return=representation");
    if (rows.length !== 1 || rows[0].research_run_id !== researchRunId ||
        rows[0].channel !== channel || rows[0].channel_id !== channelId ||
        rows[0].media_url !== videoUrl || rows[0].status !== "scheduled" ||
        rows[0].buffer_post_id !== bufferPostId ||
        Date.parse(rows[0].due_at) !== Date.parse(dueAt)) {
      throw new Error("Scheduled receipt was not durably recorded; reconcile before retry");
    }
    return {status:"scheduled",bufferPostId,dueAt,publicUrl:null};
  }

  async function getClaim({researchRunId,channel}) {
    if (!RUN_ID.test(String(researchRunId ?? "")) || !CHANNELS.has(channel)) {
      throw new Error("Invalid scheduling claim key");
    }
    const rows = await request("GET","review_schedule_claims",key(researchRunId,channel));
    if (rows.length > 1) throw new Error("Scheduling claim key is not unique");
    return rows[0] ?? null;
  }
  return {claimScheduleImpl,recordScheduledReceipt,getClaim};
}
