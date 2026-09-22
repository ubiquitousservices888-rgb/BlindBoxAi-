const BOT_SIGNATURE =
  /(?:bot|crawler|spider|slurp|facebookexternalhit|headlesschrome|lighthouse|curl|wget|python-requests|go-http-client|node-fetch|postmanruntime|httpclient|preview)/i;

function headerValue(request, name) {
  try {
    return String(request?.headers?.get?.(name) || "").trim();
  } catch {
    return "";
  }
}

export function classifyAffiliateRequest(request) {
  const method = String(request?.method || "GET").toUpperCase();
  if (method === "HEAD") {
    return { clientClass: "head", qualityReason: "method_head" };
  }

  const purpose = [
    headerValue(request, "sec-purpose"),
    headerValue(request, "purpose"),
    headerValue(request, "x-purpose"),
  ].join(" ").toLowerCase();

  if (/\b(?:prefetch|prerender)\b/.test(purpose)) {
    return { clientClass: "prefetch", qualityReason: "prefetch_header" };
  }

  const userAgent = headerValue(request, "user-agent");
  if (!userAgent) {
    return { clientClass: "bot", qualityReason: "missing_user_agent" };
  }
  if (BOT_SIGNATURE.test(userAgent)) {
    return { clientClass: "bot", qualityReason: "bot_signature" };
  }

  return { clientClass: "human_candidate", qualityReason: "default_candidate" };
}
