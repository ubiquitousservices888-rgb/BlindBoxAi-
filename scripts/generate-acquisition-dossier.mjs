const audience = "blindboxai-acquisition-dossier";
const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
if (!requestUrl || !requestToken || !supabaseUrl) throw new Error("GitHub OIDC or Supabase URL is unavailable");
const oidc = await fetch(`${requestUrl}&audience=${encodeURIComponent(audience)}`, {
  headers: { Authorization: `Bearer ${requestToken}` },
});
if (!oidc.ok) throw new Error(`OIDC token request failed: ${oidc.status}`);
const token = (await oidc.json()).value;
const response = await fetch(`${supabaseUrl}/functions/v1/acquisition-dossier`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ action: "generate" }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(body?.error || `Dossier generation failed: ${response.status}`);
console.log(`ACQUISITION_DOSSIER_PERIOD=${body.periodStart}..${body.periodEnd}`);
console.log("ACQUISITION_DOSSIER_STORED=true");
