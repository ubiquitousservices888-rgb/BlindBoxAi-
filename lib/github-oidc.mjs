const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_JWKS = "https://token.actions.githubusercontent.com/.well-known/jwks";

function parseJwtPart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export async function verifyGitHubOidcRequest(
  request,
  {
    audience,
    repository,
    workflowRef,
    allowedEvents = ["push"],
    requiredRef = "refs/heads/main",
    fetchImpl = fetch,
  } = {},
) {
  const auth = request?.headers?.get?.("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !audience || !repository || !workflowRef) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJwtPart(encodedHeader);
    const payload = parseJwtPart(encodedPayload);
    if (header?.alg !== "RS256" || !header?.kid) return null;

    const jwksResponse = await fetchImpl(OIDC_JWKS, { cache: "no-store" });
    if (!jwksResponse.ok) return null;
    const jwks = await jwksResponse.json();
    const jwk = Array.isArray(jwks?.keys)
      ? jwks.keys.find((candidate) => candidate?.kid === header.kid && candidate?.kty === "RSA")
      : null;
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      Buffer.from(encodedSignature, "base64url"),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!verified) return null;

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const events = new Set(Array.isArray(allowedEvents) ? allowedEvents : [allowedEvents]);
    if (payload.iss !== OIDC_ISSUER) return null;
    if (!audiences.includes(audience)) return null;
    if (payload.repository !== repository) return null;
    if (payload.ref !== requiredRef) return null;
    if (payload.workflow_ref !== workflowRef) return null;
    if (!events.has(String(payload.event_name || ""))) return null;
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now) return null;
    if (payload.nbf && Number(payload.nbf) > now) return null;
    if (!/^[0-9a-f]{40}$/.test(String(payload.sha || ""))) return null;
    return payload;
  } catch {
    return null;
  }
}
