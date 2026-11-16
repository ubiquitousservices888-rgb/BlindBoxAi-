import { classifyAffiliateRequest } from "../../../lib/click-quality.mjs";

export function classifyEbayAffiliateRequest(request, classifier = classifyAffiliateRequest) {
  try {
    const result = classifier(request);
    if (
      !result ||
      typeof result.clientClass !== "string" ||
      typeof result.qualityReason !== "string" ||
      !result.clientClass ||
      !result.qualityReason
    ) {
      throw new Error("Invalid affiliate click classification");
    }
    return result;
  } catch {
    return { clientClass: "unclassified", qualityReason: "classifier_error" };
  }
}

const AUTOMATED_CLIENT_CLASSES = new Set(["bot", "prefetch", "head"]);

// Known automated requests are not buyer intent and must not reach EPN tracking.
// Treat classifier errors and unknown clients as unclassified rather than
// blocking a real collector during an instrumentation failure.
export function shouldSuppressAutomatedEbayAffiliateRequest(quality) {
  return AUTOMATED_CLIENT_CLASSES.has(quality?.clientClass);
}
