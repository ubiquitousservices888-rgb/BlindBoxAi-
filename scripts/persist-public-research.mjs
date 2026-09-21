import fs from "node:fs/promises";

const OIDC_AUDIENCE = "blindboxai-research-bot";
const DEFAULT_SUPABASE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co";
const MAX_ARTIFACT_BYTES = 1_000_000;

function clean(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function validatePublicResearchArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("Public research artifact must be an object");
  }
  if (artifact.schema !== "blindboxai/know-it-all/public-research/v2") {
    throw new Error("Unexpected public research schema");
  }
  if (artifact.mode !== "credentialless-autonomous-public-research") {
    throw new Error("Unexpected public research mode");
  }
  if (!Number.isFinite(Date.parse(String(artifact.researchedAt || "")))) {
    throw new Error("Public research timestamp is invalid");
  }
  const security = artifact.security || {};
  if (
    security.credentialsProvided !== false ||
    security.secretsRead !== false ||
    security.environmentRead !== false ||
    security.privateRepositoriesAccessed !== false ||
    security.ownerApprovalRequiredForActions !== true ||
    !Array.isArray(security.sideEffectsPerformed) ||
    security.sideEffectsPerformed.length !== 0
  ) {
    throw new Error("Public research security contract failed");
  }
  const findings = Array.isArray(artifact.findings) ? artifact.findings : null;
  const sources = Array.isArray(artifact.sources) ? artifact.sources : null;
  if (!findings || findings.length > 100) throw new Error("Public research findings are invalid");
  if (!sources || sources.length > 100) throw new Error("Public research sources are invalid");
  const serialized = JSON.stringify(artifact);
  if (Buffer.byteLength(serialized, "utf8") > MAX_ARTIFACT_BYTES) {
    throw new Error("Public research artifact is too large");
  }
  return { serialized, findingCount: findings.length, sourceCount: sources.length };
}

export async function getGithubOidcToken(fetchImpl = fetch) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error("GitHub OIDC environment is unavailable");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", OIDC_AUDIENCE);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload?.value) throw new Error("GitHub OIDC token response was empty");
  return String(payload.value);
}

export async function persistPublicResearch({
  artifact,
  oidcToken,
  supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
  fetchImpl = fetch,
} = {}) {
  const checked = validatePublicResearchArtifact(artifact);
  const base = clean(supabaseUrl, 500).replace(/\/$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)) {
    throw new Error("Supabase URL is invalid");
  }
  if (!oidcToken) throw new Error("GitHub OIDC token is required");

  const response = await fetchImpl(`${base}/functions/v1/mr-know-it-all-ingest`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidcToken}`,
      "content-type": "application/json",
      "user-agent": "BlindBoxAI-KnowItAll-PublicResearch/1.0",
    },
    body: JSON.stringify({ type: "bot_public_research", artifact }),
    redirect: "error",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Public research persistence failed: ${response.status} ${clean(body?.error, 180)}`.trim());
  }
  return {
    ok: body?.ok === true,
    duplicate: body?.duplicate === true,
    findingCount: checked.findingCount,
    sourceCount: checked.sourceCount,
  };
}

async function main() {
  const artifactPath = process.argv[2];
  if (!artifactPath) throw new Error("Artifact path is required");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  const oidcToken = await getGithubOidcToken();
  const result = await persistPublicResearch({ artifact, oidcToken });
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
