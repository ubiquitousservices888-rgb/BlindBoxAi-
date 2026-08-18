import { put } from "@vercel/blob";

function clean(value, max = 180) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, max);
}

export async function recordProviderEvidence(event) {
  const provider = clean(event?.provider, 80);
  const providerEvidenceId = clean(event?.providerEvidenceId, 180);
  if (!provider || !providerEvidenceId) throw new Error("Provider and provider evidence ID are required");
  const body = {
    schemaVersion: 1,
    namespace: "production",
    test: false,
    event: "provider_conversion",
    status: event.status,
    provider,
    providerEvidenceId,
    customId: event.customId,
    occurredAt: event.occurredAt,
    confirmedRevenueUSD: event.confirmedRevenueUSD,
    evidenceSource: event.evidenceSource,
    evidenceVerifiedBy: event.evidenceVerifiedBy,
    estimate: false,
    piiStored: false,
    recordedAt: new Date().toISOString(),
  };
  const pathname = `funnel/evidence/${provider}/${providerEvidenceId}.json`;
  await put(pathname, JSON.stringify(body, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return { pathname, event: body };
}
